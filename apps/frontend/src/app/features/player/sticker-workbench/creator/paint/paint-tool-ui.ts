import type {PaintEraserMode, PaintTool} from "../shared/sticker-creator-types";

export function paintToolUsesBrushSize(tool: PaintTool): boolean {
  return tool === "brush" || tool === "eraser";
}

export function paintToolLabel(tool: PaintTool, eraserMode: PaintEraserMode): string {
  switch (tool) {
    case "hand":
      return "Hand";
    case "brush":
      return "Stift";
    case "fill":
      return "Füllen";
    case "eraser":
      return eraserMode === "sticker" ? "Radierer: Foto + Farbe" : "Radierer: Farbe";
    case "outline":
      return "Weiße Kontur";
    case "text":
      return "Text";
  }
}

export function paintCanvasCursor(params: {
  tool: PaintTool;
  toolbarVisible: boolean;
  drawing: boolean;
  panning: boolean;
}): string {
  if (params.toolbarVisible && params.tool !== "text") return "default";
  if (params.drawing) return "none";

  switch (params.tool) {
    case "hand":
      return params.panning ? "grabbing" : "grab";
    case "brush":
    case "eraser":
      return "none";
    case "fill":
      return "crosshair";
    case "outline":
      return "default";
    case "text":
      return "text";
  }
}
