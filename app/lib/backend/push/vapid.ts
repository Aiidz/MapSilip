import { createECDH, timingSafeEqual } from 'node:crypto';

/** Global preflight, before claiming work. Never infer global configuration from one endpoint. */
export function assertVapidPair(publicKey: string, privateKey: string) {
  const publicBytes = Buffer.from(publicKey, 'base64url');
  const privateBytes = Buffer.from(privateKey, 'base64url');
  if (publicBytes.length !== 65 || privateBytes.length !== 32 ||
      publicBytes.toString('base64url') !== publicKey || privateBytes.toString('base64url') !== privateKey) throw Error('Invalid push configuration');
  const curve = createECDH('prime256v1'); curve.setPrivateKey(privateBytes);
  if (!timingSafeEqual(curve.getPublicKey(), publicBytes)) throw Error('Invalid push configuration');
}
