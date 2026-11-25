import sharp from 'sharp';
import jsQR from 'jsqr';
import { assertRequestOrigin } from '@/app/lib/backend/auth/dependencies';
import { verifyAuthSession } from '@/app/lib/backend/identity';
import { BackendError, publicBackendError } from '@/app/lib/backend/security';
import { requireStaffPortalAccess } from '@/app/lib/backend/server';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { readUploadForm } from '@/app/lib/uploads/server';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

async function operate(action: string, data = {}) {
  const client = await createSupabaseServerClient();
  await verifyAuthSession(client.auth);
  const result = await client.rpc('mapsilip_operate', { p_action: action, p_data: data });
  if (result.error) throw new BackendError(result.error.code === '42501' ? 'forbidden' : 'unavailable');
  return result.data;
}

function failure(error: unknown) {
  const safe = publicBackendError(error);
  return Response.json({ message: safe.message }, { status: safe.status, headers });
}

export async function GET() {
  try {
    const qr = await operate('payment.qr.read');
    if (!qr?.png) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(Buffer.from(qr.png, 'base64')), {
      headers: { ...headers, 'Content-Type': 'image/png' },
    });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    assertRequestOrigin(request);
    await requireStaffPortalAccess('owner');
    let png: Buffer;
    try {
      const file = (await readUploadForm(request)).get('file');
      if (!(file instanceof File) || !['image/png', 'image/jpeg'].includes(file.type) || file.size > 2_000_000) throw new Error();
      const image = sharp(await file.arrayBuffer(), { limitInputPixels: 4_000_000, failOn: 'warning' });
      const metadata = await image.metadata();
      if (file.type !== `image/${metadata.format}` || (metadata.pages ?? 1) !== 1) throw new Error();
      png = await image.clone().rotate().png({ compressionLevel: 9 }).toBuffer();
      if (file.type === 'image/jpeg' && png.length > 262500) {
        png = await image.rotate().png({ palette: true, colours: 32, dither: 0 }).toBuffer();
      }
      const decode = async (width?: number) => {
        const source = sharp(png).flatten({ background: '#fff' }).ensureAlpha();
        if (width) source.resize({ width });
        const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
        return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data;
      };
      const code = await decode();
      if (!code || await decode(280) !== code) throw new Error();
      if (png.length > 262500) throw new Error();
    } catch { throw new BackendError('invalid_input'); }
    await operate('payment.qr.save', { png: png.toString('base64') });
    return Response.json({ saved: true }, { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    assertRequestOrigin(request);
    await requireStaffPortalAccess('owner');
    await operate('payment.qr.disable');
    return Response.json({ saved: true }, { headers });
  } catch (error) { return failure(error); }
}
