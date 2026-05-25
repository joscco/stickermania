import {Component, input, output, signal, viewChild, ElementRef, AfterViewInit, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";

interface Point {x: number; y: number}

/**
 * Shape-split minigame: player drags two points to define a cut line through a polygon.
 * The two resulting areas are coloured but the player doesn't see the exact proportion.
 * The actual area fraction is computed on submit and sent to the backend.
 */

@Component({
  selector: "app-minigame-shape-split",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./minigame-shape-split.component.html",
  host: {"class": "flex-1 flex flex-col items-center justify-center gap-4 p-4 w-full"},
})
export class MinigameShapeSplitComponent implements AfterViewInit, OnDestroy {
  /** Polygon vertices in viewBox-local coords (0-200 range). */
  readonly polygon = input<Point[]>(DEFAULT_POLYGON);
  readonly targetLabel = input<string>("50:50");
  readonly submitted = output<{cutLine: {a: Point; b: Point}; areaFraction: number}>();

  readonly svgRef = viewChild<ElementRef<SVGSVGElement>>("svg");

  // Handle positions in viewBox coords (0-200)
  handleA = signal<Point>({x: 60, y: 100});
  handleB = signal<Point>({x: 140, y: 100});
  dragging = signal<'A' | 'B' | null>(null);

  // For visual feedback: which side is which colour
  side1Path = signal<string>("");
  side2Path = signal<string>("");

  private boundPointerMove = (e: PointerEvent) => this.onPointerMove(e);
  private boundPointerUp = () => this.onPointerUp();

  ngAfterViewInit(): void {
    this.recalcSides();
    document.addEventListener("pointermove", this.boundPointerMove);
    document.addEventListener("pointerup", this.boundPointerUp);
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointermove", this.boundPointerMove);
    document.removeEventListener("pointerup", this.boundPointerUp);
  }

  onHandleDown(which: 'A' | 'B', e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragging.set(which);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.dragging();
    if (!d) return;

    const svg = this.svgRef()?.nativeElement;
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM()?.inverse());

    // Clamp inside polygon bounding box
    const p = this.polygon();
    const minX = Math.min(...p.map(v => v.x));
    const maxX = Math.max(...p.map(v => v.x));
    const minY = Math.min(...p.map(v => v.y));
    const maxY = Math.max(...p.map(v => v.y));

    const x = Math.max(minX, Math.min(maxX, loc.x));
    const y = Math.max(minY, Math.min(maxY, loc.y));

    if (d === 'A') this.handleA.set({x, y});
    else this.handleB.set({x, y});

    this.recalcSides();
  }

  private onPointerUp(): void {
    this.dragging.set(null);
  }

  private recalcSides(): void {
    const poly = this.polygon();
    const a = this.handleA();
    const b = this.handleB();

    // Find all intersection points of line AB with polygon edges
    const intersections: Array<{point: Point; edgeIndex: number; t: number; u: number}> = [];
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const isect = lineIntersect(a, b, poly[i], poly[j]);
      if (isect && isect.t > 0.0001 && isect.t < 0.9999 && isect.u > 0.0001 && isect.u < 0.9999) {
        intersections.push({point: isect.point, edgeIndex: i, t: isect.t, u: isect.u});
      }
    }

    // For a convex polygon, a line intersects at 0 or 2 edges
    // If both handles are inside, we need the boundary intersections
    const isInside = (pt: Point) => pointInPolygon(pt, poly);
    const aInside = isInside(a);
    const bInside = isInside(b);

    let cutPoints: Point[] = [];
    if (aInside && bInside) {
      // Both inside: line AB, find 2 boundary intersections
      cutPoints = intersections.map(i => i.point);
    } else if (aInside) {
      // A inside, B outside: A + 1 boundary intersection
      const nearest = intersections
        .map(i => ({...i, da: distSq(i.point, a)}))
        .sort((x, y) => x.da - y.da)[0];
      if (nearest) cutPoints = [a, nearest.point];
      else cutPoints = [a];
    } else if (bInside) {
      const nearest = intersections
        .map(i => ({...i, db: distSq(i.point, b)}))
        .sort((x, y) => x.db - y.db)[0];
      if (nearest) cutPoints = [b, nearest.point];
      else cutPoints = [b];
    } else {
      // Both outside: find 2 boundary intersections
      cutPoints = intersections.map(i => i.point);
    }

    if (cutPoints.length < 2) {
      this.side1Path.set("");
      this.side2Path.set("");
      return;
    }

    // Build two polygons by following the original edges and inserting cut points
    const {poly1, poly2} = splitPolygon(poly, cutPoints[0], cutPoints[1]);
    this.side1Path.set(poly1.length > 2 ? pointsToPath(poly1) : "");
    this.side2Path.set(poly2.length > 2 ? pointsToPath(poly2) : "");
  }

  public areaFraction(): number {
    const poly = this.polygon();
    const a = this.handleA();
    const b = this.handleB();

    const intersections: Array<{point: Point; t: number; u: number}> = [];
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const isect = lineIntersect(a, b, poly[i], poly[j]);
      if (isect && isect.t > 0.0001 && isect.t < 0.9999 && isect.u > 0.0001 && isect.u < 0.9999) {
        intersections.push(isect);
      }
    }

    const isInside = (pt: Point) => pointInPolygon(pt, poly);
    const aInside = isInside(a);
    const bInside = isInside(b);

    let cutPoints: Point[] = [];
    if (aInside && bInside) {
      cutPoints = intersections.map(i => i.point);
    } else if (aInside) {
      const nearest = intersections
        .map(i => ({point: i.point, da: distSq(i.point, a)}))
        .sort((x, y) => x.da - y.da)[0];
      if (nearest) cutPoints = [a, nearest.point];
    } else if (bInside) {
      const nearest = intersections
        .map(i => ({point: i.point, db: distSq(i.point, b)}))
        .sort((x, y) => x.db - y.db)[0];
      if (nearest) cutPoints = [b, nearest.point];
    } else {
      cutPoints = intersections.map(i => i.point);
    }

    if (cutPoints.length < 2) return 0.5;

    const {poly1, poly2} = splitPolygon(poly, cutPoints[0], cutPoints[1]);
    const area1 = polygonArea(poly1);
    const area2 = polygonArea(poly2);
    const total = area1 + area2;
    if (total <= 0) return 0.5;
    return Math.min(area1, area2) / total;
  }

  public submit(): void {
    const fraction = this.areaFraction();
    this.submitted.emit({
      cutLine: {a: this.handleA(), b: this.handleB()},
      areaFraction: fraction,
    });
  }
}

const DEFAULT_POLYGON: Point[] = [
  {x: 20, y: 20},
  {x: 180, y: 20},
  {x: 180, y: 180},
  {x: 20, y: 180},
];

function distSq(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function lineIntersect(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
): {point: Point; t: number; u: number} | null {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const det = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(det) < 1e-9) return null;

  const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / det;
  const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / det;

  return {
    point: {x: a1.x + t * dx1, y: a1.y + t * dy1},
    t,
    u,
  };
}

function pointInPolygon(pt: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

function splitPolygon(poly: Point[], p1: Point, p2: Point): {poly1: Point[]; poly2: Point[]} {
  // Find where p1 and p2 lie on edges
  const insertions: Array<{index: number; point: Point}> = [];

  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    if (pointOnSegment(p1, poly[i], poly[j])) insertions.push({index: i, point: p1});
    if (pointOnSegment(p2, poly[i], poly[j])) insertions.push({index: i, point: p2});
  }

  // Deduplicate and sort by edge index
  const unique = insertions.filter((v, i, a) =>
    a.findIndex(t => samePoint(t.point, v.point)) === i
  );
  unique.sort((a, b) => a.index - b.index);

  if (unique.length < 2) return {poly1: poly, poly2: []};

  // Build ordered vertex list with insertions
  const verts: Array<{point: Point; isCut: boolean}> = [];
  for (let i = 0; i < poly.length; i++) {
    const ins = unique.filter(u => u.index === i);
    ins.forEach(u => verts.push({point: u.point, isCut: true}));
    verts.push({point: poly[i], isCut: false});
  }

  // Find cut point indices
  const cutIndices = verts.map((v, i) => v.isCut ? i : -1).filter(i => i >= 0);
  if (cutIndices.length < 2) return {poly1: poly, poly2: []};

  // Walk around in both directions between cut points
  const n = verts.length;
  const i1 = cutIndices[0];
  const i2 = cutIndices[1];

  const poly1: Point[] = [];
  for (let i = i1; i !== i2; i = (i + 1) % n) {
    poly1.push(verts[i].point);
  }
  poly1.push(verts[i2].point);

  const poly2: Point[] = [];
  for (let i = i2; i !== i1; i = (i + 1) % n) {
    poly2.push(verts[i].point);
  }
  poly2.push(verts[i1].point);

  return {poly1, poly2};
}

function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y);
  return dot <= 1e-6;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function pointsToPath(pts: Point[]): string {
  return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ") + " Z";
}
