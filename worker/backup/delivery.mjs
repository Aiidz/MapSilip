import { verify } from 'node:crypto';

export function validateLocalCustody({ payload, signature }, expected, receiverKey) {
  if (typeof payload !== 'string' || payload.length > 2048 || typeof signature !== 'string' ||
      signature.length > 128 ||
      !verify(null, Buffer.from(payload), receiverKey, Buffer.from(signature, 'base64'))) {
    throw new Error('Invalid local custody signature');
  }
  const receipt = JSON.parse(payload);
  if (receipt.version !== 1 || receipt.jobId !== expected.jobId ||
      receipt.receiptSha256 !== expected.receiptSha256) throw new Error('Local custody receipt mismatch');
  return receipt;
}
