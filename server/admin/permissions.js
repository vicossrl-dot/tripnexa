import { assert } from '../errors.js';
export const ROLES = ['USER','ADMIN','SUPER_ADMIN'];
export const STATUSES = ['ACTIVE','SUSPENDED','DISABLED','PENDING_DELETION'];
export const privileged = user => ['ADMIN','SUPER_ADMIN'].includes(user?.role);
export function requirePrivileged(req, _res, next) {
  try { assert(req.user,401,'Please sign in.'); assert(req.user.status === 'ACTIVE',403,'This account is not active.'); assert(privileged(req.user),403,'Administrator access is required.'); next(); } catch(error) {next(error);}
}
export function requireAdmin(req, res, next) {
  requirePrivileged(req,res,error=>{if(error)return next(error);try{assert(req.session?.mfa_verified_at,403,'Complete administrator MFA before continuing.');next();}catch(failure){next(failure);}});
}
export function requireSuperAdmin(req, _res, next) {try{assert(req.user?.role==='SUPER_ADMIN',403,'Super administrator access is required.');next();}catch(error){next(error);}}
export function requireRecentAuth(req, _res, next) {
  try {const time = value => Date.parse(String(value || '').replace(' ','T')+'Z');assert(Date.now()-time(req.session?.authenticated_at)<10*60000 && Date.now()-time(req.session?.mfa_verified_at)<10*60000,403,'Confirm your password and MFA again before this sensitive action.');next();}catch(error){next(error);}
}
export function canManage(actor,target) {return actor.role==='SUPER_ADMIN'||actor.role==='ADMIN'&&target.role==='USER';}
