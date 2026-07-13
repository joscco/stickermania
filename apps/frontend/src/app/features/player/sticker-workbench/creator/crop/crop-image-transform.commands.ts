import type {CanvasPoint, ImageTransform} from "../shared/sticker-creator-types";

export type CropImageTransformCommand =
  | {type: "panImage"; deltaX: number; deltaY: number}
  | {
      type: "pinchImage";
      startTransform: ImageTransform;
      startCenter: CanvasPoint;
      currentCenter: CanvasPoint;
      scaleFactor: number;
    }
  | {type: "zoomImage"; point: CanvasPoint; factor: number};

export type CropImageTransformCommandServiceOptions = {
  getImageTransform: () => ImageTransform;
  setImageTransform: (transform: ImageTransform) => void;
  clampScale: (scale: number) => number;
  redraw: () => void;
};

export class CropImageTransformCommandService {
  constructor(private readonly options: CropImageTransformCommandServiceOptions) {}

  execute(command: CropImageTransformCommand): void {
    const nextTransform = applyCropImageTransformCommand(
      this.options.getImageTransform(),
      command,
      this.options.clampScale,
    );

    this.options.setImageTransform(nextTransform);
    this.options.redraw();
  }
}

export function applyCropImageTransformCommand(
  currentTransform: ImageTransform,
  command: CropImageTransformCommand,
  clampScale: (scale: number) => number,
): ImageTransform {
  switch (command.type) {
    case "panImage": {
      return {
        ...currentTransform,
        x: currentTransform.x + command.deltaX,
        y: currentTransform.y + command.deltaY,
      };
    }

    case "pinchImage": {
      return {
        x: command.currentCenter.x + (command.startTransform.x - command.startCenter.x) * command.scaleFactor,
        y: command.currentCenter.y + (command.startTransform.y - command.startCenter.y) * command.scaleFactor,
        scale: command.startTransform.scale * command.scaleFactor,
        rotation: command.startTransform.rotation,
      };
    }

    case "zoomImage": {
      const nextScale = clampScale(currentTransform.scale * command.factor);
      const actualFactor = currentTransform.scale === 0 ? 1 : nextScale / currentTransform.scale;

      return {
        ...currentTransform,
        x: command.point.x + (currentTransform.x - command.point.x) * actualFactor,
        y: command.point.y + (currentTransform.y - command.point.y) * actualFactor,
        scale: nextScale,
      };
    }
  }
}
