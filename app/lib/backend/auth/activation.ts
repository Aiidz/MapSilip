import { BackendError } from '../security';

export function isStaffAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.MAPSILIP_STAFF_AUTH_ENABLED === 'true';
}

/** Deployment staging only; all Auth and database authority checks still run when enabled. */
export function assertStaffAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  if (!isStaffAuthEnabled(environment)) throw new BackendError('unavailable');
}
