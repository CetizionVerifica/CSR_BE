import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';

/** Password policy (US-01-1): ≥ 12 chars, zxcvbn score ≥ 3, not breached (checked separately). */
export const PASSWORD_POLICY = { minLength: 12, maxLength: 256, minScore: 3 } as const;

const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...en.dictionary },
  graphs: common.adjacencyGraphs,
  translations: en.translations,
});

export type PasswordPolicyIssue = 'too_short' | 'too_long' | 'too_weak';

/**
 * Deterministic strength check. `userInputs` (email, name) are penalised by zxcvbn so a password
 * built from the user's own details is rejected. Length is checked in code points.
 */
export function checkPasswordPolicy(password: string, userInputs: string[] = []): PasswordPolicyIssue[] {
  const length = [...password].length;
  if (length < PASSWORD_POLICY.minLength) return ['too_short'];
  if (length > PASSWORD_POLICY.maxLength) return ['too_long'];
  const inputs = userInputs.flatMap((s) => [s, ...s.split(/[@.\s_-]+/)]).filter((s) => s.length >= 3);
  const { score } = zxcvbn.check(password, inputs);
  return score < PASSWORD_POLICY.minScore ? ['too_weak'] : [];
}
