type Point = { x: number; y: number };
export function pinchView(options: {
  startZoom: number;
  startDistance: number;
  currentDistance: number;
  minZoom: number;
  maxZoom: number;
  anchor: Point;
  currentPoint: Point;
  center: Point;
}): { zoom: number; pan: Point };
