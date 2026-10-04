/**
 * RFC 9457 problem details. `type` values are stable identifiers the FE can switch on
 * (docs/revamp/01-target-architecture.md ADR-004).
 */
export const PROBLEM_TYPES = {
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  entitlement_required: 403,
  limit_exceeded: 403,
  workspace_suspended: 403,
  email_not_verified: 403,
  invalid_token: 400,
  not_found: 404,
  conflict: 409,
  invalid_state_transition: 409,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
} as const;

export type ProblemType = keyof typeof PROBLEM_TYPES;

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: Array<{ path: string; message: string }>;
  [extension: string]: unknown;
}

export const problemTypeUri = (type: ProblemType): string => `https://resilisense.org/problems/${type}`;

/** Throw from services/controllers: `throw new ProblemError('not_found', 'Company not found')`. */
export class ProblemError extends Error {
  readonly status: number;

  constructor(
    readonly type: ProblemType,
    readonly title: string,
    readonly detail?: string,
    readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
    this.name = 'ProblemError';
    this.status = PROBLEM_TYPES[type];
  }
}
