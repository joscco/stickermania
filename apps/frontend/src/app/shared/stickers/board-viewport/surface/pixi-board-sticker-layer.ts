import type {BoardStickerPlacement, StickerDefinition} from "@stickermania/shared";
import {effectiveScaleX, effectiveScaleY} from "../../placement-canvas/rendering/sticker-transform.util";
import type {StickerAnimState} from "../../primitives/sticker-item/sticker-item.component";
import type {BoardBounds} from "../geometry/sticker-board-types";
import type {Application, Container, Sprite, Texture} from "pixi.js";
import {PixiBoardTextureStore} from "./pixi-board-texture-store";

type PixiModule = typeof import("pixi.js");

type PixiStickerNode = {
  placement: BoardStickerPlacement;
  node: Container;
  visual: Container;
  shadow: Sprite;
  animationState: StickerAnimState | null;
  animationFrameId: number | null;
  animationToken: number;
};

export type PixiBoardStickerData = {
  placements: BoardStickerPlacement[];
  stickerCatalog: StickerDefinition[];
  bounds: BoardBounds;
  stickerBaseSize: number;
};

type StickerLayerOptions = {
  pixi: PixiModule;
  app: Application;
  container: Container;
  textures: PixiBoardTextureStore;
  scheduleRender: () => void;
};

export class PixiBoardStickerLayer {
  private readonly nodes: PixiStickerNode[] = [];
  private readonly nodeById = new Map<string, PixiStickerNode>();
  private generation = 0;
  private destroyed = false;
  private shadowOffsetX = 2;
  private shadowOffsetY = 3;
  private animationStates: Record<string, StickerAnimState> = {};

  constructor(private readonly options: StickerLayerOptions) {}

  async rebuild(data: PixiBoardStickerData): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const generation = ++this.generation;
    const catalog = new Map(data.stickerCatalog.map(sticker => [sticker.id, sticker]));
    const placements = [...data.placements].sort((left, right) => left.zIndex - right.zIndex);
    const nextNodes = await Promise.all(placements.map(async placement => {
      const definition = catalog.get(placement.stickerId);
      if (!definition) {
        return null;
      }
      const texture = await this.options.textures.textureFor(definition.imageUrl).catch(() => null);
      return texture ? this.createNode(placement, definition, texture, data) : null;
    }));

    if (this.destroyed || generation !== this.generation) {
      return;
    }

    const visibleNodes = nextNodes.filter((item): item is PixiStickerNode => item !== null);
    const visibleNodeIds = new Set(visibleNodes.map(item => item.placement.instanceId));
    const removingNodes = this.nodes.filter(item => {
      if (visibleNodeIds.has(item.placement.instanceId)) {
        return false;
      }

      if (item.animationState !== "removing") {
        this.animateNode(item, "removing");
      }
      return true;
    });
    const removingNodeIds = new Set(removingNodes.map(item => item.placement.instanceId));
    for (const item of this.nodes) {
      if (!removingNodeIds.has(item.placement.instanceId)) {
        this.cancelAnimation(item);
      }
    }
    this.options.container.removeChildren();
    this.nodes.length = 0;
    this.nodeById.clear();
    this.nodes.push(...visibleNodes, ...removingNodes);
    this.nodes.sort((left, right) => left.placement.zIndex - right.placement.zIndex);
    for (const item of this.nodes) {
      this.nodeById.set(item.placement.instanceId, item);
    }
    if (this.nodes.length > 0) {
      this.options.container.addChild(...this.nodes.map(item => item.node));
    }

    this.applyShadowState();
    this.applyAnimationStates(this.animationStates);
    this.options.scheduleRender();
  }

  setAnimationStates(states: Record<string, StickerAnimState>): void {
    this.animationStates = states;
    this.applyAnimationStates(states);
  }

  setShadowOffset(x: number, y: number): void {
    this.shadowOffsetX = x;
    this.shadowOffsetY = y;
    this.applyShadowState();
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    this.cancelAllAnimations();
    this.nodes.length = 0;
    this.nodeById.clear();
  }

  private createNode(
    placement: BoardStickerPlacement,
    definition: StickerDefinition,
    texture: Texture,
    data: PixiBoardStickerData,
  ): PixiStickerNode {
    const node = new this.options.pixi.Container();
    const visual = new this.options.pixi.Container();
    const sprite = new this.options.pixi.Sprite(texture);
    const anchorX = definition.overlayBounds?.x ?? 0.5;
    const anchorY = definition.overlayBounds?.y ?? 0.5;
    const textureHeight = texture.height || data.stickerBaseSize;
    const textureWidth = texture.width || data.stickerBaseSize;
    const renderedHeight = data.stickerBaseSize;
    const renderedWidth = renderedHeight * textureWidth / textureHeight;

    sprite.anchor.set(anchorX, anchorY);
    sprite.width = renderedWidth;
    sprite.height = renderedHeight;

    const shadow = new this.options.pixi.Sprite(texture);
    shadow.anchor.set(anchorX, anchorY);
    shadow.width = renderedWidth;
    shadow.height = renderedHeight;
    shadow.tint = 0x111111;
    shadow.alpha = 0.35;
    visual.addChild(shadow, sprite);

    node.position.set(placement.x - data.bounds.minX, placement.y - data.bounds.minY);
    node.rotation = placement.rotation * Math.PI / 180;
    node.scale.set(effectiveScaleX(placement), effectiveScaleY(placement));
    node.addChild(visual);
    return {placement, node, visual, shadow, animationState: null, animationFrameId: null, animationToken: 0};
  }

  private applyAnimationStates(states: Record<string, StickerAnimState>): void {
    if (this.destroyed) {
      return;
    }

    for (const [instanceId, state] of Object.entries(states)) {
      const item = this.nodeById.get(instanceId);
      if (item) {
        this.animateNode(item, state);
      }
    }
  }

  private animateNode(item: PixiStickerNode, state: StickerAnimState): void {
    if (item.animationState === state && item.animationFrameId !== null) {
      return;
    }

    this.cancelAnimation(item);
    item.animationState = state;
    switch (state) {
      case "entering":
        this.animateVisual(item, {
          durationMs: 220, fromAlpha: 0, toAlpha: 1,
          fromScaleX: 0.5, fromScaleY: 0.5, toScaleX: 1, toScaleY: 1,
          fromRotation: -0.08, toRotation: 0, ease: this.easeOutBack,
        });
        return;
      case "settling":
        this.animateVisual(item, {
          durationMs: 360, fromAlpha: 1, toAlpha: 1,
          fromScaleX: 1.03, fromScaleY: 0.97, toScaleX: 1, toScaleY: 1,
          fromRotation: 0.01, toRotation: 0, ease: this.easeOutBack,
        });
        return;
      case "removing":
        item.node.eventMode = "none";
        this.animateVisual(item, {
          durationMs: 220, fromAlpha: item.visual.alpha, toAlpha: 0,
          fromScaleX: item.visual.scale.x || 1, fromScaleY: item.visual.scale.y || 1,
          toScaleX: 0.5, toScaleY: 0.5,
          fromRotation: item.visual.rotation || 0, toRotation: -0.08, ease: this.easeInBack,
          onComplete: () => this.removeNode(item),
        });
        return;
      case "idle":
        this.resetVisual(item);
    }
  }

  private animateVisual(
    item: PixiStickerNode,
    options: {
      durationMs: number;
      fromAlpha: number;
      toAlpha: number;
      fromScaleX: number;
      fromScaleY: number;
      toScaleX: number;
      toScaleY: number;
      fromRotation: number;
      toRotation: number;
      ease: (progress: number) => number;
      onComplete?: () => void;
    },
  ): void {
    const token = ++item.animationToken;
    const startTime = performance.now();
    item.visual.alpha = options.fromAlpha;
    item.visual.scale.set(options.fromScaleX, options.fromScaleY);
    item.visual.rotation = options.fromRotation;

    const step = (timestamp: number): void => {
      if (item.animationToken !== token || this.destroyed) {
        return;
      }
      const rawProgress = Math.min(1, (timestamp - startTime) / options.durationMs);
      const progress = options.ease(rawProgress);
      item.visual.alpha = this.interpolate(options.fromAlpha, options.toAlpha, progress);
      item.visual.scale.set(
        this.interpolate(options.fromScaleX, options.toScaleX, progress),
        this.interpolate(options.fromScaleY, options.toScaleY, progress),
      );
      item.visual.rotation = this.interpolate(options.fromRotation, options.toRotation, progress);
      this.options.app.render();

      if (rawProgress < 1) {
        item.animationFrameId = requestAnimationFrame(step);
      } else {
        item.animationFrameId = null;
        item.visual.alpha = options.toAlpha;
        item.visual.scale.set(options.toScaleX, options.toScaleY);
        item.visual.rotation = options.toRotation;
        options.onComplete?.();
      }
    };
    item.animationFrameId = requestAnimationFrame(step);
  }

  private applyShadowState(): void {
    if (this.destroyed) {
      return;
    }
    for (const item of this.nodes) {
      const offset = this.shadowOffsetFor(item.placement);
      item.shadow.visible = true;
      item.shadow.position.set(offset.x, offset.y);
    }
    this.options.scheduleRender();
  }

  private shadowOffsetFor(placement: BoardStickerPlacement): {x: number; y: number} {
    const scaleX = effectiveScaleX(placement);
    const scaleY = effectiveScaleY(placement);
    if (scaleX === 0 || scaleY === 0) {
      return {x: 0, y: 0};
    }

    const radians = placement.rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
      x: (this.shadowOffsetX * cos + this.shadowOffsetY * sin) / scaleX,
      y: (-this.shadowOffsetX * sin + this.shadowOffsetY * cos) / scaleY,
    };
  }

  private resetVisual(item: PixiStickerNode): void {
    this.cancelAnimation(item);
    item.animationState = null;
    item.node.eventMode = "auto";
    item.visual.alpha = 1;
    item.visual.scale.set(1);
    item.visual.rotation = 0;
  }

  private removeNode(item: PixiStickerNode): void {
    this.cancelAnimation(item);
    this.options.container.removeChild(item.node);
    const index = this.nodes.indexOf(item);
    if (index >= 0) {
      this.nodes.splice(index, 1);
    }
    this.nodeById.delete(item.placement.instanceId);
    this.options.scheduleRender();
  }

  private cancelAllAnimations(): void {
    for (const item of this.nodes) {
      this.cancelAnimation(item);
    }
  }

  private cancelAnimation(item: PixiStickerNode): void {
    item.animationToken++;
    if (item.animationFrameId !== null) {
      cancelAnimationFrame(item.animationFrameId);
      item.animationFrameId = null;
    }
  }

  private interpolate(start: number, target: number, amount: number): number {
    return start + (target - start) * amount;
  }

  private readonly easeOutBack = (progress: number): number => {
    const overshoot = 1.70158;
    const shiftedProgress = progress - 1;
    return 1 + (overshoot + 1) * shiftedProgress ** 3 + overshoot * shiftedProgress ** 2;
  };

  private readonly easeInBack = (progress: number): number => {
    const overshoot = 1.70158;
    return progress ** 2 * ((overshoot + 1) * progress - overshoot);
  };
}
