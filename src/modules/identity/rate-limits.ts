import { type RateLimitRule } from '../../infra/rate-limit/rate-limiter';
import { LOCKOUT } from './engine/lockout';

/** Rate limits on public identity endpoints (M01 §4.1, §5 US-01-2, ADR-010). */
export const LIMITS = {
  loginIp: { name: 'login:ip', limit: 30, windowSec: 60 },
  loginFailures: { name: 'login:fail', limit: LOCKOUT.maxFailures, windowSec: LOCKOUT.windowSec },
  mfaUser: { name: 'mfa:user', limit: 10, windowSec: 15 * 60 },
  forgotIp: { name: 'forgot:ip', limit: 5, windowSec: 3600 },
  forgotEmail: { name: 'forgot:email', limit: 5, windowSec: 3600 },
  resetIp: { name: 'reset:ip', limit: 20, windowSec: 3600 },
  signupIp: { name: 'signup:ip', limit: 5, windowSec: 3600 },
  verifyIp: { name: 'verify:ip', limit: 20, windowSec: 3600 },
  resendEmail: { name: 'verify-resend:email', limit: 3, windowSec: 3600 },
  inviteAcceptIp: { name: 'invite-accept:ip', limit: 20, windowSec: 3600 },
  refreshIp: { name: 'refresh:ip', limit: 120, windowSec: 60 },
  passwordCheckUser: { name: 'password-check:user', limit: 10, windowSec: 3600 },
} satisfies Record<string, RateLimitRule>;
