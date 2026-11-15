import { IMAGE_TYPES, MAX_SOURCE_BYTES, MAX_UPLOAD_BYTES, uploadSettings } from './policy.mjs';

export type UploadPurpose = 'payment' | 'maintenance' | 'profile' | 'contract';

/** Shrink photos before they consume network bandwidth or server memory. */
export async function prepareUpload(file: File, purpose: UploadPurpose): Promise<File> {
  if (!file.size) throw new Error('Choose a file that is not empty.');
  if (purpose === 'contract') {
    if (![...IMAGE_TYPES, 'application/pdf'].includes(file.type)) throw new Error('Choose an original PDF, JPEG or PNG contract.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('Contract files must be under 2 MB. Originals are preserved.');
    return file;
  }
  if (file.type === 'application/pdf' && purpose !== 'profile') {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('PDFs must be under 2 MB. Export a smaller PDF and try again.');
    return file;
  }
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Choose a JPEG or PNG image. Convert HEIC photos to JPEG first.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image under 12 MB.');
  const url = URL.createObjectURL(file);
  const image = new Image(); image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('This image could not be read.')); image.src = url; });
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Image dimensions are too large. Export a smaller image.');
    const { maxEdge, targetBytes } = uploadSettings(purpose);
    const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable. Try another browser.');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of purpose === 'payment' ? [.88, .82, .78] : [.86, .78, .70]) {
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (!blob) throw new Error('The image could not be compressed.');
      if (blob.size <= targetBytes) break;
    }
    if (file.type === 'image/png' && file.size <= targetBytes) {
      const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (png && (!blob || png.size < blob.size)) blob = png;
    }
    canvas.width = 0; canvas.height = 0;
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('The image is still too large. Choose a smaller image.');
    const extension = blob.type === 'image/png' ? 'png' : 'jpg';
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type });
  } finally { URL.revokeObjectURL(url); image.src = ''; }
}

export async function uploadAttachment(file: File, purpose: UploadPurpose): Promise<string> {
  const prepared = await prepareUpload(file, purpose);
  return uploadPreparedAttachment(prepared, purpose);
}

export async function uploadPreparedAttachment(prepared: File, purpose: UploadPurpose): Promise<string> {
  const body = new FormData(); body.set('file', prepared); body.set('purpose', purpose);
  const response = await fetch('/api/attachments', { method: 'POST', body, credentials: 'same-origin' });
  const result = await response.json();
  if (!response.ok || typeof result.id !== 'string') throw new Error(result.message || 'The file could not be uploaded.');
  return result.id;
}
