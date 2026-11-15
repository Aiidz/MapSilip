export const MAX_UPLOAD_BYTES: number;
export const MAX_SOURCE_BYTES: number;
export const IMAGE_TYPES: string[];
export function uploadSettings(purpose: string): { maxEdge: number; targetBytes: number };
