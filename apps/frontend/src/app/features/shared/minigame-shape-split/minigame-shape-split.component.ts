import {Component, input, output, signal, viewChild, ElementRef, AfterViewInit, OnDestroy, computed} from "@angular/core";
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
  readonly backgroundSvg = input<string | null>(null);
  readonly submitted = output<{cutLine: {a: Point; b: Point}; areaFraction: number}>();

  readonly svgRef = viewChild<ElementRef<SVGSVGElement>>("svg");

  readonly bgSvgId = computed(() => {
    const s = this.backgroundSvg();
    if (!s) return null;
    return s.startsWith('sprite:#') ? s.replace('sprite:#', '') : s;
  });

  // Handle positions in viewBox coords (0-200)
  handleA = signal<Point>({x: 60, y: 100});
  handleB = signal<Point>({x: 140, y: 100});
  dragging = signal<'A' | 'B' | null>(null);

  // For visual feedback: which side is which color
  side1Path = signal<string>("");
  side2Path = signal<string>("");
  side1AreaPct = signal<number>(0);
  side2AreaPct = signal<number>(0);

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

    // Find all intersections of the infinite line AB with polygon edges
    const intersections = findBoundaryIntersections(poly, a, b);

    if (intersections.length < 2) {
      this.side1Path.set("");
      this.side2Path.set("");
      this.side1AreaPct.set(0);
      this.side2AreaPct.set(0);
      return;
    }

    // Take the two extreme intersections along the line
    const sorted = [...intersections].sort((x, y) => x.t - y.t);
    const cut1 = {point: sorted[0].point, edgeIndex: sorted[0].edgeIndex};
    const cut2 = {point: sorted[sorted.length - 1].point, edgeIndex: sorted[sorted.length - 1].edgeIndex};

    const {poly1, poly2} = splitPolygonByEdges(poly, cut1, cut2);
    this.side1Path.set(poly1.length > 2 ? pointsToPath(poly1) : "");
    this.side2Path.set(poly2.length > 2 ? pointsToPath(poly2) : "");

    const area1 = polygonArea(poly1);
    const area2 = polygonArea(poly2);
    const total = area1 + area2;
    if (total > 0) {
      this.side1AreaPct.set(Math.round((area1 / total) * 100));
      this.side2AreaPct.set(Math.round((area2 / total) * 100));
    }
  }

  public areaFraction(): number {
    const poly = this.polygon();
    const a = this.handleA();
    const b = this.handleB();

    const intersections = findBoundaryIntersections(poly, a, b);
    if (intersections.length < 2) return 0.5;

    const sorted = [...intersections].sort((x, y) => x.t - y.t);
    const cut1 = {point: sorted[0].point, edgeIndex: sorted[0].edgeIndex};
    const cut2 = {point: sorted[sorted.length - 1].point, edgeIndex: sorted[sorted.length - 1].edgeIndex};

    const {poly1, poly2} = splitPolygonByEdges(poly, cut1, cut2);
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

function polygonArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Split a polygon into two halves by cutting along the line from cut1 to cut2.
 * cut1 and cut2 are ON polygon edges. edgeIndex refers to the polygon edge
 * from poly[edgeIndex] to poly[(edgeIndex+1)%n].
 * When edgeIndex === -1, the point is a handle inside the polygon (not on an edge);
 * in that case the two halves share that point.
 */
function findBoundaryIntersections(
  poly: Point[], a: Point, b: Point,
): Array<{point: Point; edgeIndex: number; t: number; u: number}> {
  const eps = 1e-9;
  const raw: Array<{point: Point; edgeIndex: number; t: number; u: number}> = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const isect = lineIntersect(a, b, poly[i], poly[j]);
    if (isect && isect.u >= -eps && isect.u <= 1 + eps) {
      raw.push({point: isect.point, edgeIndex: i, t: isect.t, u: Math.max(0, Math.min(1, isect.u))});
    }
  }
  // Deduplicate: when line hits a vertex, two adjacent edges report the same point
  const result: Array<{point: Point; edgeIndex: number; t: number; u: number}> = [];
  for (const r of raw) {
    const dup = result.find(e => Math.abs(e.point.x - r.point.x) < 0.01 && Math.abs(e.point.y - r.point.y) < 0.01);
    if (!dup) result.push(r);
  }
  return result;
}

function splitPolygonByEdges(
  poly: Point[],
  cut1: {point: Point; edgeIndex: number},
  cut2: {point: Point; edgeIndex: number},
): {poly1: Point[]; poly2: Point[]} {
  const n = poly.length;

  // Build an ordered list of vertices with cut points inserted at their edges.
  // For handle points (edgeIndex === -1), insert at the start.
  const verts: Point[] = [];
  const cutIdx1: number[] = [];
  const cutIdx2: number[] = [];

  for (let i = 0; i < n; i++) {
    // Insert cut points BEFORE vertex i if they belong to edge (i-1 → i)
    // Actually: edge i connects vertex i to vertex (i+1)%n.
    // We insert cut points AFTER vertex i if they belong to edge i.
    verts.push(poly[i]);
    if (cut1.edgeIndex === i) { cutIdx1.push(verts.length); verts.push(cut1.point); }
    if (cut2.edgeIndex === i) { cutIdx2.push(verts.length); verts.push(cut2.point); }
  }

  // If we didn't find edge matches (handle points with -1), add at end
  if (cutIdx1.length === 0) { cutIdx1.push(verts.length); verts.push(cut1.point); }
  if (cutIdx2.length === 0) { cutIdx2.push(verts.length); verts.push(cut2.point); }

  const idx1 = cutIdx1[0];
  const idx2 = cutIdx2[0];
  const m = verts.length;

  // Walk from cut1 to cut2 in one direction
  const poly1: Point[] = [];
  for (let i = idx1; i !== idx2; i = (i + 1) % m) {
    poly1.push(verts[i]);
  }
  poly1.push(verts[idx2]);

  // Walk from cut2 to cut1 in the other direction
  const poly2: Point[] = [];
  for (let i = idx2; i !== idx1; i = (i + 1) % m) {
    poly2.push(verts[i]);
  }
  poly2.push(verts[idx1]);

  return {poly1, poly2};
}

function pointsToPath(pts: Point[]): string {
  return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ") + " Z";
}
