import { BackendError } from './security';

export function isTenantAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  return environment.MAPSILIP_TENANT_AUTH_ENABLED === 'true';
}

export function assertTenantAuthEnabled(environment: NodeJS.ProcessEnv = process.env) {
  if (!isTenantAuthEnabled(environment)) throw new BackendError('unavailable');
}
