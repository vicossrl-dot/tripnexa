import { assert } from '../errors.js';

export const ROLES = ['USER','ADMIN','SUPER_ADMIN'];
export const STATUSES = ['ACTIVE','SUSPENDED','DISABLED','PENDING_DELETION'];
export const privileged = user => ['ADMIN','SUPER_ADMIN'].includes(user?.role);

export function requirePrivileged(req, _res, next) {
  try {
    assert(req.user,401,'Please sign in.');
    assert(req.user.status === 'ACTIVE',403,'This account is not active.');
    assert(privileged(req.user),403,'Administrator access is required.');
    next();
  } catch(error) {
    next(error);
  }
}

export function requireAdmin(req, res, next) {
  requirePrivileged(req,res,error=>{
    if(error)return next(error);
    try {
      assert(req.session?.mfa_verified_at,403,'Complete administrator MFA before continuing.');
      next();
    } catch(failure) {
      next(failure);
    }
  });
}

export function requireSuperAdmin(req, _res, next) {
  try {
    assert(req.user?.role==='SUPER_ADMIN',403,'Super administrator access is required.');
    next();
  } catch(error) {
    next(error);
  }
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();

  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value !== 'string' || !value.trim()) return NaN;

  const raw = value.trim();

  // MariaDB DATETIME values represented as SQL UTC strings.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
    return Date.parse(raw.replace(' ','T') + 'Z');
  }

  // Already ISO-formatted or another Date.parse-compatible representation.
  return Date.parse(raw);
}

export function requireRecentAuth(req, _res, next) {
  try {
    const now = Date.now();
    const authenticatedAt = timestamp(req.session?.authenticated_at);
    const mfaVerifiedAt = timestamp(req.session?.mfa_verified_at);
    const windowMs = 10 * 60 * 1000;

    assert(
      Number.isFinite(authenticatedAt) &&
      Number.isFinite(mfaVerifiedAt) &&
      now >= authenticatedAt &&
      now >= mfaVerifiedAt &&
      now - authenticatedAt < windowMs &&
      now - mfaVerifiedAt < windowMs,
      403,
      'Confirm your password and MFA again before this sensitive action.'
    );

    next();
  } catch(error) {
    next(error);
  }
}

export function canManage(actor,target) {
  return actor.role==='SUPER_ADMIN' || actor.role==='ADMIN' && target.role==='USER';
}
