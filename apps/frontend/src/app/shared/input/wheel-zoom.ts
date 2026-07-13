export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}
