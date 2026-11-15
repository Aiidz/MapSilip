export function pinchView({ startZoom, startDistance, currentDistance, minZoom, maxZoom, anchor, currentPoint, center }) {
  const zoom = Math.max(minZoom, Math.min(maxZoom, startZoom * currentDistance / Math.max(1, startDistance)));
  return {
    zoom,
    pan: {
      x: currentPoint.x - center.x - zoom * (anchor.x - center.x),
      y: currentPoint.y - center.y - zoom * (anchor.y - center.y),
    },
  };
}
