import type {AreaPiece, CutLine, Point} from "../geometry";

export function pointsToAttribute(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function pointsToPath(points: Point[]): string {
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")} Z`;
}

export function backgroundHref(backgroundSvg: string | null | undefined): string | null {
  if (!backgroundSvg) return null;
  const id = backgroundSvg.startsWith("sprite:#")
    ? backgroundSvg.replace("sprite:#", "")
    : backgroundSvg;
  return `#${id}`;
}

export function initialCutLines(targetParts: number): CutLine[] {
  const lineCount = Math.max(1, Math.round(targetParts) - 1);
  return Array.from({length: lineCount}, (_, index) => {
    const x = 90 + (180 * index) / Math.max(1, lineCount - 1);
    return {
      a: {x, y: 86},
      b: {x, y: 394},
    };
  });
}

export function pieceFill(index: number): string {
  return ["#FDE047", "#60A5FA", "#34D399", "#FB7185", "#C084FC", "#F97316"][index % 6];
}

export function roundedPercent(value: number): number {
  return Math.round(value * 100);
}
