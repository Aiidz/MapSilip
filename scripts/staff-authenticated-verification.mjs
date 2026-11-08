import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import nextEnv from '@next/env';
import { runAuthenticatedStaffVerification, assertSyntheticEmail } from './lib/staff-authenticated-verification.mjs';

const { loadEnvConfig } = nextEnv;
const root = process.cwd();

function setTerminalEcho(enabled) {
  try {
    execFileSync('stty', [enabled ? 'echo' : '-echo'], { stdio: ['/dev/tty', 'ignore', 'ignore'] });
  } catch {
    throw new Error('A real interactive terminal is required; no password was read.');
  }
}

async function readInputs() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Run this command in a local interactive terminal; no password was read.');
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const ask = prompt => new Promise(resolve => {
    process.stdout.write(prompt);
    terminal.question('', answer => resolve(answer));
  });
  let echoDisabled = false;
  const restoreEcho = () => {
    if (!echoDisabled) return;
    try { setTerminalEcho(true); } catch { /* Best effort during process shutdown. */ }
    echoDisabled = false;
  };
  try {
    setTerminalEcho(false);
    echoDisabled = true;
    process.once('exit', restoreEcho);
    process.stdout.write('Input is hidden. Use only the existing synthetic .invalid accounts. Values stay in this process.\n');
    const ownerEmail = assertSyntheticEmail(await ask('Synthetic owner email: '));
    const ownerCurrentPassword = await ask('Owner current temporary/current password: ');
    const ownerReplacementPassword = await ask('Owner replacement password (leave blank only if already admitted): ');
    const caretakerEmail = assertSyntheticEmail(await ask('Synthetic caretaker email: '));
    const caretakerCurrentPassword = await ask('Caretaker current temporary/current password: ');
    const caretakerReplacementPassword = await ask('Caretaker replacement password (leave blank only if already admitted): ');
    if (ownerEmail === caretakerEmail) throw new Error('The two synthetic accounts must be distinct.');
    if (!ownerCurrentPassword || ownerCurrentPassword.length > 1024 ||
        !caretakerCurrentPassword || caretakerCurrentPassword.length > 1024) {
      throw new Error('Current passwords must be non-empty and within the supported length.');
    }
    return {
      owner: { role: 'owner', email: ownerEmail, currentPassword: ownerCurrentPassword,
        replacementPassword: ownerReplacementPassword },
      caretaker: { role: 'caretaker', email: caretakerEmail, currentPassword: caretakerCurrentPassword,
        replacementPassword: caretakerReplacementPassword },
    };
  } finally {
    restoreEcho();
    process.removeListener('exit', restoreEcho);
    terminal.close();
    process.stdout.write('\n');
  }
}

async function main() {
  loadEnvConfig(root);
  if (process.env.MAPSILIP_STAFF_AUTH_ENABLED === 'true') {
    throw new Error('Refusing to run while the persistent local staff-auth flag is enabled.');
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const appOrigin = process.env.MAPSILIP_APP_ORIGIN;
  if (!projectUrl || new URL(projectUrl).origin !== 'https://atuqxpiandeutimdkgag.supabase.co' ||
      !publishableKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey) || !appOrigin) {
    throw new Error('Required local configuration is absent or does not match the authorized project.');
  }
  const localOrigin = new URL(appOrigin);
  if (localOrigin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(localOrigin.hostname) ||
      localOrigin.pathname !== '/' || localOrigin.search || localOrigin.hash || localOrigin.username || localOrigin.password) {
    throw new Error('Set MAPSILIP_APP_ORIGIN to a local loopback HTTP origin.');
  }
  const credentials = await readInputs();
  try {
    const results = await runAuthenticatedStaffVerification({ projectUrl, publishableKey, appOrigin,
      identities: [credentials.owner, credentials.caretaker] });
    process.stdout.write(`${JSON.stringify({ checks: results,
      deactivation_and_reissue: 'not_run_no_test_only_mutation_command',
      hosted_rate_limit_exhaustion: 'not_run_to_avoid_persistent_lockout',
      hosted_concurrency: 'not_run_no_controlled_test_barrier',
      staff_auth_enabled: false })}\n`);
  } finally {
    credentials.owner.currentPassword = '';
    credentials.owner.replacementPassword = '';
    credentials.caretaker.currentPassword = '';
    credentials.caretaker.replacementPassword = '';
  }
}

try {
  await main();
} catch {
  process.stderr.write('Authenticated verification stopped. Passwords, tokens, and response bodies were suppressed.\n');
  process.exitCode = 1;
}
