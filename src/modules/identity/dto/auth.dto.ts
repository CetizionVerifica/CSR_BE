import { z } from 'zod';

/** Emails are compared case-insensitively (citext) and stored trimmed + lower-cased. */
export const emailField = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Length is re-checked by the password policy; the cap bounds hashing cost. */
export const passwordField = z.string().min(1).max(256);
const nameField = z.string().trim().min(1).max(120);

export const loginBody = z.strictObject({
  email: emailField,
  password: passwordField,
  workspaceId: z.uuid().optional(),
});

export const sessionResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int(),
  workspaceId: z.uuid().nullable(),
});

export const loginResponse = z.union([
  sessionResponse,
  z.object({ mfaRequired: z.literal(true), mfaToken: z.string() }),
  z.object({ mfaEnrollmentRequired: z.literal(true), mfaToken: z.string() }),
]);

export const mfaVerifyBody = z
  .strictObject({
    mfaToken: z.string().min(1).max(2048),
    code: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    recoveryCode: z.string().min(10).max(32).optional(),
  })
  .refine((b) => !!b.code !== !!b.recoveryCode, {
    message: 'Provide either code or recoveryCode',
    path: ['code'],
  });

export const mfaSetupResponse = z.object({ secret: z.string(), otpauthUri: z.string() });
export const mfaConfirmBody = z.strictObject({ code: z.string().regex(/^\d{6}$/) });
export const mfaConfirmResponse = z.object({
  recoveryCodes: z.array(z.string()),
  session: sessionResponse.nullable(),
});
export const mfaDisableBody = z.strictObject({ password: passwordField, code: z.string().regex(/^\d{6}$/) });

export const signupBody = z.strictObject({
  name: nameField,
  email: emailField,
  password: passwordField,
  workspaceName: z.string().trim().min(2).max(120),
});

export const emailOnlyBody = z.strictObject({ email: emailField });
export const tokenBody = z.strictObject({ token: z.string().min(16).max(256) });
export const resetPasswordBody = z.strictObject({
  token: z.string().min(16).max(256),
  password: passwordField,
});

export const acceptedResponse = z.object({ status: z.literal('accepted') });
export const verifyEmailResponse = z.object({
  status: z.literal('verified'),
  purpose: z.enum(['signup', 'email_change']),
});
export const logoutQuery = z.object({
  all: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
