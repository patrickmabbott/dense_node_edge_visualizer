export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

function cross(ox, oy, ax, ay, bx, by) {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

export function segmentCircleIntersects(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax;
  const dy = by - ay;
  const fx = ax - cx;
  const fy = ay - cy;

  const a = dx * dx + dy * dy;
  if (a < 1e-10) return false;

  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return false;

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  if (t1 >= 0 && t1 <= 1) return true;
  if (t2 >= 0 && t2 <= 1) return true;
  if (t1 < 0 && t2 > 1) return true;

  return false;
}

export function segmentAngleDeg(ax, ay, bx, by, cx, cy, dx, dy) {
  const dx1 = bx - ax;
  const dy1 = by - ay;
  const dx2 = dx - cx;
  const dy2 = dy - cy;
  const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
  const dot = Math.abs(dx1 * dx2 + dy1 * dy2);
  return Math.atan2(cross, dot) * (180 / Math.PI);
}

export function nodeInViewport(x, y, radius, width, height) {
  return (x - radius >= 0) && (x + radius <= width) &&
         (y - radius >= 0) && (y + radius <= height);
}
