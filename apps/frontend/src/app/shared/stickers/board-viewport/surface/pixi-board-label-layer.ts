import type {BoardStickerPlacement, StickerDefinition} from "@birthday/shared";
import {buildPlacementLabels, type PlacementBadge, type PlacementLabel} from "../labels/sticker-board-label-layout";
import type {BoardBounds} from "../geometry/sticker-board-types";
import {STICKERMANIA_COLORS} from "../../../theme/stickermania-theme";
import type {Container, Graphics, Text} from "pixi.js";
import type {PixiBoardCameraState} from "./pixi-board-camera-layer";
import {PixiBoardTextureStore} from "./pixi-board-texture-store";

type PixiModule = typeof import("pixi.js");

type PixiLabelNode = {
  label: PlacementLabel;
  node: Container;
};

export type PixiBoardLabelData = {
  placements: BoardStickerPlacement[];
  stickerCatalog: StickerDefinition[];
  placementBadges: Record<string, PlacementBadge>;
  bounds: BoardBounds;
  boardWidth: number;
  boardHeight: number;
  stickerBaseSize: number;
  zoom: number;
  visible: boolean;
};

type LabelLayerOptions = {
  pixi: PixiModule;
  container: Container;
  textures: PixiBoardTextureStore;
  viewportSize: () => {width: number; height: number};
  scheduleRender: () => void;
};

const SCREEN_SAFE_SIZE = 58;
const SCREEN_BADGE_GAP = 12;
const BADGE_GRAPHIC_SIZE = 52;
const AVATAR_SIZE = 40;

export class PixiBoardLabelLayer {
  private readonly nodes: PixiLabelNode[] = [];
  private generation = 0;
  private destroyed = false;
  private camera: PixiBoardCameraState | null = null;

  constructor(private readonly options: LabelLayerOptions) {}

  async rebuild(data: PixiBoardLabelData): Promise<void> {
    if (this.destroyed) {
      return;
    }

    const generation = ++this.generation;
    if (!data.visible) {
      this.options.container.removeChildren();
      this.nodes.length = 0;
      this.options.scheduleRender();
      return;
    }

    const worldSize = (screenSize: number): number => screenSize / Math.max(0.001, data.zoom);
    const labels = buildPlacementLabels({
      placements: data.placements,
      stickerCatalog: data.stickerCatalog,
      placementBadges: data.placementBadges,
      bounds: data.bounds,
      boardWidth: data.boardWidth,
      boardHeight: data.boardHeight,
      stickerBaseSize: data.stickerBaseSize,
      labelSafeSize: worldSize(SCREEN_SAFE_SIZE),
      badgeGap: worldSize(SCREEN_BADGE_GAP),
    });
    const nextNodes = await Promise.all(labels.map(label => this.createNode(label)));

    if (this.destroyed || generation !== this.generation) {
      return;
    }

    this.options.container.removeChildren();
    this.nodes.length = 0;
    this.nodes.push(...nextNodes);
    if (nextNodes.length > 0) {
      this.options.container.addChild(...nextNodes.map(item => item.node));
    }
    if (this.camera) {
      this.positionNodes(this.camera);
    }
    this.options.scheduleRender();
  }

  applyCamera(camera: PixiBoardCameraState): void {
    this.camera = {...camera};
    this.positionNodes(camera);
  }

  private positionNodes(camera: PixiBoardCameraState): void {
    const {width, height} = this.options.viewportSize();
    for (const item of this.nodes) {
      const screenX = camera.panX + item.label.centerX * camera.zoom;
      const screenY = camera.panY + item.label.centerY * camera.zoom;
      item.node.position.set(screenX, screenY);
      item.node.visible = screenX >= -SCREEN_SAFE_SIZE
        && screenY >= -SCREEN_SAFE_SIZE
        && screenX <= width + SCREEN_SAFE_SIZE
        && screenY <= height + SCREEN_SAFE_SIZE;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.generation++;
    this.nodes.length = 0;
  }

  private async createNode(label: PlacementLabel): Promise<PixiLabelNode> {
    const node = new this.options.pixi.Container();
    node.visible = false;
    node.addChild(this.createBadgeGraphic(label.arrowRotation));

    if (label.avatarUrl) {
      const texture = await this.options.textures.textureFor(label.avatarUrl).catch(() => null);
      if (texture) {
        const avatar = new this.options.pixi.Sprite(texture);
        avatar.anchor.set(0.5);
        avatar.scale.set(AVATAR_SIZE / Math.min(texture.width || AVATAR_SIZE, texture.height || AVATAR_SIZE));

        const avatarMask = new this.options.pixi.Graphics();
        avatarMask.circle(0, 0, AVATAR_SIZE / 2);
        avatarMask.fill(0xffffff);
        avatar.mask = avatarMask;
        node.addChild(avatarMask, avatar);
      } else {
        node.addChild(this.createInitialText(label.name));
      }
    } else {
      node.addChild(this.createInitialText(label.name));
    }

    return {label, node};
  }

  private createBadgeGraphic(rotationDegrees: number): Graphics {
    const graphic = new this.options.pixi.Graphics();
    const scale = BADGE_GRAPHIC_SIZE / 64;

    graphic.ellipse(0, 0, 12.818 * scale, 16.717 * scale);
    graphic.poly([
      31.24 * scale, 0,
      5.264 * scale, 15.247 * scale,
      5.264 * scale, -15.247 * scale,
    ]);
    graphic.fill(0xffffff);
    graphic.rotation = rotationDegrees * Math.PI / 180;
    return graphic;
  }

  private createInitialText(name: string): Text {
    const text = new this.options.pixi.Text({
      text: name.trim().slice(0, 1).toUpperCase() || "?",
      style: {
        fill: this.color(STICKERMANIA_COLORS.inkHard),
        fontFamily: "Arial, sans-serif",
        fontSize: 14,
        fontWeight: "900",
      },
    });
    text.anchor.set(0.5);
    return text;
  }

  private color(hex: string): number {
    return Number.parseInt(hex.replace("#", ""), 16);
  }
}
