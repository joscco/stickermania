export interface Point {
  x: number;
  y: number;
}

export interface CutLine {
  a: Point;
  b: Point;
}

export interface AreaPiece {
  polygon: Point[];
  area: number;
  fraction: number;
}

const EPSILON = 1e-7;

export function polygonArea(polygon: Point[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  return Math.abs(area) / 2;
}

export function splitPolygonIntoPieces(polygon: Point[], lines: CutLine[]): AreaPiece[] {
  const sourceArea = polygonArea(polygon);
  if (polygon.length < 3 || sourceArea <= 0) {
    return [];
  }

  let pieces = [polygon];
  for (const line of lines) {
    if (distance(line.a, line.b) < EPSILON) {
      continue;
    }

    pieces = pieces.flatMap((piece) => {
      const split = splitPolygonByLine(piece, line);
      return split ?? [piece];
    });
  }

  return pieces
    .map((piece) => {
      const area = polygonArea(piece);
      return {
        polygon: piece,
        area,
        fraction: area / sourceArea,
      };
    })
    .filter((piece) => piece.area > EPSILON);
}

export function scoreShapeCut(args: {
  polygon: Point[];
  lines: CutLine[];
  targetParts: number;
}): {
  pieces: AreaPiece[];
  deviationPercentagePoints: number;
  pieceCount: number;
  targetFraction: number;
} {
  const targetParts = Math.max(2, Math.round(args.targetParts));
  const targetFraction = 1 / targetParts;
  const pieces = splitPolygonIntoPieces(args.polygon, args.lines);
  const fractions = pieces.map((piece) => piece.fraction).sort((a, b) => b - a);

  let deviation = Math.abs(pieces.length - targetParts);
  for (let i = 0; i < targetParts; i++) {
    deviation += Math.abs((fractions[i] ?? 0) - targetFraction);
  }

  return {
    pieces,
    deviationPercentagePoints: deviation * 100,
    pieceCount: pieces.length,
    targetFraction,
  };
}

function splitPolygonByLine(polygon: Point[], line: CutLine): [Point[], Point[]] | null {
  const positive: Point[] = [];
  const negative: Point[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentSide = signedDistanceToLine(current, line);
    const nextSide = signedDistanceToLine(next, line);

    if (currentSide >= -EPSILON) positive.push(current);
    if (currentSide <= EPSILON) negative.push(current);

    if ((currentSide > EPSILON && nextSide < -EPSILON) || (currentSide < -EPSILON && nextSide > EPSILON)) {
      const intersection = segmentLineIntersection(current, next, line);
      if (intersection) {
        positive.push(intersection);
        negative.push(intersection);
      }
    }
  }

  const a = dedupePolygon(positive);
  const b = dedupePolygon(negative);
  if (a.length < 3 || b.length < 3) return null;
  if (polygonArea(a) <= EPSILON || polygonArea(b) <= EPSILON) return null;

  return [a, b];
}

function signedDistanceToLine(point: Point, line: CutLine): number {
  return (line.b.x - line.a.x) * (point.y - line.a.y) -
    (line.b.y - line.a.y) * (point.x - line.a.x);
}

function segmentLineIntersection(start: Point, end: Point, line: CutLine): Point | null {
  const startSide = signedDistanceToLine(start, line);
  const endSide = signedDistanceToLine(end, line);
  const denominator = startSide - endSide;
  if (Math.abs(denominator) < EPSILON) return null;

  const t = startSide / denominator;
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function dedupePolygon(polygon: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of polygon) {
    const previous = result[result.length - 1];
    if (!previous || distance(previous, point) > 0.01) {
      result.push(point);
    }
  }

  if (result.length > 1 && distance(result[0], result[result.length - 1]) <= 0.01) {
    result.pop();
  }

  return result;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
