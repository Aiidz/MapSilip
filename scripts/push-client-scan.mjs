/** Report names/counts only; never print secret values or bundle excerpts. */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const names = ['WEB_PUSH_VAPID_PRIVATE_KEY', 'MAPSILIP_PUSH_WORKER_SECRET', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD', 'MAPSILIP_DATABASE_PASSWORD', 'MAPSILIP_SECURITY_EXECUTOR_PASSWORD', 'MAPSILIP_RATE_LIMIT_HASH_KEY'];
const secrets = names.filter(name => process.env[name]?.length >= 16);
let files = 0;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:js|json|map|html|css)$/.test(entry.name)) {
      files++; const content = await readFile(path, 'utf8');
      for (const name of secrets) if (content.includes(process.env[name])) throw Error(`Client secret exposure detected for ${name}; do not publish.`);
      if (/WEB_PUSH_VAPID_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|mapsilip_push_claim/.test(content)) throw Error('Server-only push code detected in static client artifacts; do not publish.');
    }
  }
}
await scan('.next/static');
console.log(`PASS: scanned ${files} client artifacts against ${secrets.length} configured private values; no server-only push identifiers found.`);
console.log('Scope: current build/configured values only; physical browser and hosted log inspection remain separate.');
