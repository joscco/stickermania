/**
 * Automatically generates a polygon hitbox from a PNG image by tracing
 * the alpha-channel contour. Uses marching squares for contour extraction
 * and Douglas–Peucker for simplification.
 *
 * All coordinates are normalised 0–1 relative to image width/height.
 */

export interface Point {
    x: number;
    y: number;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Load the image, render it to a canvas, extract the alpha mask,
 * trace the contour and simplify it.
 *
 * @param imageUrl  URL of the PNG (can be relative)
 * @param tolerance Douglas–Peucker tolerance (0–1 normalised). Higher = fewer points.
 * @param alphaThreshold  Pixel is "solid" if alpha >= this value (0–255).
 * @returns Array of normalised {x, y} points forming the polygon.
 */
export async function autoDetectHitbox(
    imageUrl: string,
    tolerance = 0.02,
    alphaThreshold = 20,
): Promise<Point[]> {
    const img = await loadImage(imageUrl);
    const {width, height, alphaData} = getAlphaData(img, alphaThreshold);
    const contour = traceContour(alphaData, width, height);
    if (contour.length < 3) return [];

    // Normalise to 0–1
    const normalised = contour.map(p => ({
        x: p.x / width,
        y: p.y / height,
    }));

    // Simplify
    const simplified = douglasPeucker(normalised, tolerance);

    // Round to 2 decimal places
    return simplified.map(p => ({
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
    }));
}

// ── Image loading ───────────────────────────────────────────

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
        img.src = url;
    });
}

function getAlphaData(
    img: HTMLImageElement,
    alphaThreshold: number,
): { width: number; height: number; alphaData: Uint8Array } {
    const canvas = document.createElement("canvas");
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);

    // Binary alpha mask: 1 = solid, 0 = transparent
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        alpha[i] = imageData.data[i * 4 + 3] >= alphaThreshold ? 1 : 0;
    }
    return {width: w, height: h, alphaData: alpha};
}

// ── Contour tracing (simple boundary walk) ──────────────────

function traceContour(
    alpha: Uint8Array,
    w: number,
    h: number,
): Point[] {
    // Find a starting solid pixel on the boundary (scan from top-left)
    let startX = -1, startY = -1;
    outer:
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (alpha[y * w + x] === 1) {
                // Check if it's a boundary pixel (has at least one transparent neighbor)
                if (isBoundary(alpha, w, h, x, y)) {
                    startX = x;
                    startY = y;
                    break outer;
                }
            }
        }
    }
    if (startX < 0) return [];

    // Walk the boundary using Moore neighborhood tracing
    const contour: Point[] = [];
    const visited = new Set<string>();
    const directions = [
        {dx: 1, dy: 0}, {dx: 1, dy: 1}, {dx: 0, dy: 1}, {dx: -1, dy: 1},
        {dx: -1, dy: 0}, {dx: -1, dy: -1}, {dx: 0, dy: -1}, {dx: 1, dy: -1},
    ];

    let cx = startX, cy = startY;
    let dir = 0; // start direction
    const maxSteps = w * h * 2; // safety limit
    let steps = 0;

    do {
        const key = `${cx},${cy}`;
        if (!visited.has(key)) {
            contour.push({x: cx, y: cy});
            visited.add(key);
        }

        // Find next boundary pixel
        let found = false;
        const startDir = (dir + 5) % 8; // start searching from dir-3 (backtrack)
        for (let i = 0; i < 8; i++) {
            const d = (startDir + i) % 8;
            const nx = cx + directions[d].dx;
            const ny = cy + directions[d].dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
                alpha[ny * w + nx] === 1 && isBoundary(alpha, w, h, nx, ny)) {
                cx = nx;
                cy = ny;
                dir = d;
                found = true;
                break;
            }
        }
        if (!found) break;
        steps++;
    } while ((cx !== startX || cy !== startY) && steps < maxSteps);

    return contour;
}

function isBoundary(alpha: Uint8Array, w: number, h: number, x: number, y: number): boolean {
    if (alpha[y * w + x] !== 1) return false;
    // Edge of image counts as boundary
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return true;
    // Check 4-connected neighbors
    return (
        alpha[y * w + (x - 1)] === 0 ||
        alpha[y * w + (x + 1)] === 0 ||
        alpha[(y - 1) * w + x] === 0 ||
        alpha[(y + 1) * w + x] === 0
    );
}

// ── Douglas–Peucker line simplification ─────────────────────

function douglasPeucker(points: Point[], epsilon: number): Point[] {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
        const d = perpendicularDistance(points[i], first, last);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }

    if (maxDist > epsilon) {
        const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
        const right = douglasPeucker(points.slice(maxIdx), epsilon);
        return [...left.slice(0, -1), ...right];
    }

    return [first, last];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
    }

    const t = Math.max(0, Math.min(1,
        ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.hypot(point.x - projX, point.y - projY);
}

