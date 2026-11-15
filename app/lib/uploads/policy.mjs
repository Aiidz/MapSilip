export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png'];
export function uploadSettings(purpose) {
  if (purpose === 'profile') return { maxEdge: 512, targetBytes: 180 * 1024 };
  if (purpose === 'maintenance') return { maxEdge: 1600, targetBytes: 600 * 1024 };
  return { maxEdge: 2000, targetBytes: 220 * 1024 };
}
