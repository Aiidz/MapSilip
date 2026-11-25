import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const localKeyId = 'local-v1';

export function validLocalWrappingKey(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}

/** Route local envelopes to the shared deployment key and delegate KMS envelopes to the configured provider. */
export function withLocalWrappingKey(kms, env = process.env) {
  function key() {
    if (!validLocalWrappingKey(env.BACKUP_LOCAL_WRAPPING_KEY)) throw new Error('Invalid local backup wrapping key');
    return Buffer.from(env.BACKUP_LOCAL_WRAPPING_KEY, 'hex');
  }
  return {
    async wrap(bytes, keyId, aad) {
      if (keyId !== localKeyId) return kms.wrap(bytes,keyId,aad);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm',key(),iv);
      cipher.setAAD(aad);
      const ciphertext = Buffer.concat([cipher.update(bytes),cipher.final()]);
      return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
    },
    async unwrap(value, keyId, aad) {
      if (keyId !== localKeyId) return kms.unwrap(value,keyId,aad);
      const encrypted = Buffer.from(value,'base64');
      if (encrypted.length !== 60) throw new Error('Invalid wrapped backup key');
      const decipher = createDecipheriv('aes-256-gcm',key(),encrypted.subarray(0,12));
      decipher.setAAD(aad);
      decipher.setAuthTag(encrypted.subarray(12,28));
      return Buffer.concat([decipher.update(encrypted.subarray(28)),decipher.final()]);
    },
  };
}
