export type IsoPoint = { x: number; y: number };

export function iso(x: number, y: number): IsoPoint {
  return { x: 330 + (x - y) * 60, y: 92 + (x + y) * 30 };
}

export function polygon(points: IsoPoint[]): string {
  return points.map(point => `${point.x},${point.y}`).join(' ');
}

export function tile(x: number, y: number): string {
  return polygon([iso(x, y), iso(x + 1, y), iso(x + 1, y + 1), iso(x, y + 1)]);
}

export function floorOutline(): string {
  return polygon([iso(-0.1, -0.1), iso(4.1, -0.1), iso(4.1, 3.1), iso(-0.1, 3.1)]);
}
