const errors = {
  invalid_input: { status: 400, message: 'Check the supplied information.' },
  unauthenticated: { status: 401, message: 'Sign in to continue.' },
  rate_limited: { status: 429, message: 'Too many recent attempts. Wait a little while, then try again.' },
  forbidden: { status: 403, message: 'Access denied.' },
  unavailable: { status: 503, message: 'The service is unavailable. Try again later.' },
} as const;

export type BackendErrorStage = 'request_origin' | 'origin_missing' | 'origin_mismatch' | 'request_method' |
  'input_validation' | 'feature_gate' | 'staff_dependencies' |
  'staff_signin' | 'rate_limit' | 'staff_lookup' | 'supabase_auth' | 'supabase_identity' |
  'staff_admission' | 'staff_role_consistency' | 'tenant_signin' | 'tenant_identity' |
  'tenant_profile' | 'tenant_room_assignment' | 'account_pending' | 'account_rejected' | 'session_persistence' | 'session_cookie' | 'first_login_feature_gate' |
  'first_login_origin' | 'first_login_input' | 'first_login_client_address' | 'first_login_dependencies' |
  'first_login_session_verification' | 'first_login_rate_limit' | 'first_login_admission' |
  'first_login_password_update' | 'first_login_global_signout' | 'first_login_fresh_auth' |
  'first_login_session_check' | 'first_login_completion' | 'first_login_cookie' | 'unknown';

export class BackendError extends Error {
  readonly code: keyof typeof errors;
  readonly stage?: BackendErrorStage;
  readonly detail?: string;

  constructor(code: keyof typeof errors, stage?: BackendErrorStage, detail?: string) {
    super(detail || errors[code].message);
    this.code = code;
    this.stage = stage;
    this.detail = detail;
  }
}

/** Never serialize provider errors, request bodies, cookies or tokens to clients. */
export function publicBackendError(error: unknown) {
  if (error instanceof BackendError) {
    const code = error.code;
    const base = errors[code];
    if (error.stage === 'account_rejected' || error.stage === 'account_pending') {
      return { status: base.status, code, message: error.detail || base.message };
    }
    return { status: base.status, code, message: base.message };
  }
  return { ...errors.unavailable, code: 'unavailable' as const };
}

/** trustedOrigin must come from server configuration, never Host/forwarded headers. */
export function requireMutationOrigin(request: Request, trustedOrigin: string) {
  let origin: URL;
  try {
    origin = new URL(trustedOrigin);
  } catch {
    throw new BackendError('unavailable');
  }
  const localDevelopment = process.env.NODE_ENV !== 'production' &&
    origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.origin !== trustedOrigin || (origin.protocol !== 'https:' && !localDevelopment)) {
    throw new BackendError('unavailable');
  }
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) throw new BackendError('forbidden', 'request_method');
  const originHeader = request.headers.get('origin');
  if (originHeader !== trustedOrigin) throw new BackendError('forbidden', originHeader ? 'origin_mismatch' : 'origin_missing');
}

/** Exact server-owned paths only. Query strings and encoded paths are deliberately unsupported. */
export function safeReturnPath(value: unknown, allowed: readonly string[], fallback: string) {
  const valid = (path: string) => /^\/(?:[A-Za-z0-9_-]+\/?)*$/.test(path);
  if (!allowed.includes(fallback) || !valid(fallback) || allowed.some(path => !valid(path))) {
    throw new BackendError('unavailable');
  }
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
