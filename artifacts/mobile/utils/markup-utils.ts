export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

export interface MarkupData {
  w: number;
  h: number;
  strokes: Stroke[];
}

export function pointsToPath(points: StrokePoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${(p.x + 0.1).toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}

export function scaleStrokes(
  strokes: Stroke[],
  savedW: number,
  savedH: number,
  currentW: number,
  currentH: number
): Stroke[] {
  if (savedW === currentW && savedH === currentH) {
    return strokes;
  }
  const scaleX = currentW / savedW;
  const scaleY = currentH / savedH;
  return strokes.map(stroke => ({
    ...stroke,
    points: stroke.points.map(p => ({
      x: p.x * scaleX,
      y: p.y * scaleY,
    })),
  }));
}
