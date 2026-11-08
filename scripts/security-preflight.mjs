import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { REVIEWED_PREFLIGHT_FILES, runSecurityPreflight } from './lib/security-preflight.mjs';

const { loadEnvConfig } = nextEnv;

const root = process.cwd();
const files = REVIEWED_PREFLIGHT_FILES;

try {
  if (process.env.MAPSILIP_RUN_SECURITY_PREFLIGHT !== '1') {
    throw new Error('Security preflight refused: set MAPSILIP_RUN_SECURITY_PREFLIGHT=1 to opt in.');
  }
  loadEnvConfig(root);
  const content = await Promise.all(files.map(file => readFile(`${root}/${file}`)));
  const hashes = Object.fromEntries(files.map((file, index) => [
    file, createHash('sha256').update(content[index]).digest('hex'),
  ]));
  const manifest = JSON.parse(await readFile(`${root}/supabase/review/staff-security-manifest.json`, 'utf8'));
  const result = await runSecurityPreflight({
    optIn: process.env.MAPSILIP_RUN_SECURITY_PREFLIGHT,
    manifest,
    hashes,
    environment: process.env,
  });
  process.stdout.write(`Auth health: HTTP ${result.status}; reachable=${result.authReachable}\n`);
  if (!result.authReachable) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  process.stderr.write(`${message.startsWith('Security preflight refused:') ? message :
    error?.code === 'ENOENT'
      ? 'Security preflight refused: the local approval manifest or a reviewed file is missing.'
      : 'Security preflight refused: local configuration is unavailable.'}\n`);
  process.exitCode = 1;
}
