/**
 * Pure parsing of the ISO 26000 key-consideration library (Docs/GapAnalysisV2.xlsx)
 * into reference rows. No I/O here — see ./index.ts for loading and writing.
 * Spec: docs/revamp/modules/M04-gap-analysis.md §4.1/§6 and M13 §7.
 */
import { uuidFromName } from '../../src/common/ids';
import { CORE_SUBJECTS, ISSUES } from './iso26000-labels';

export const TAXONOMY_CODE = 'ISO26000-v3';

export type AnswerType = 'header' | 'yes_no' | 'legal_3' | 'yes_count' | 'ratio_band' | 'gender_pay_gap';

/** One data row of the workbook sheet "GapAnalysis v3 PS" (columns A–J). */
export interface WorkbookRow {
  coreSubject: string;
  issue: string;
  code: string;
  label: string;
  orderBy: number;
  groupBy: number;
  dropdown: number;
  answerOptions: string | null;
  backendScores: string | null;
  evidenceHint: string | null;
}

export interface SeedCoreSubject {
  id: string;
  key: string;
  code: string;
  sortOrder: number;
  label: string;
}
export interface SeedIssue {
  id: string;
  coreSubjectId: string;
  key: string;
  code: string;
  sortOrder: number;
  label: string;
}
export interface SeedKeyConsideration {
  id: string;
  issueId: string;
  code: string;
  legacyKey: string;
  sortOrder: number;
  groupIndex: number;
  label: string;
  evidenceHint: string | null;
  answerType: AnswerType;
  answerOptions: Record<string, unknown>;
  scoringRule: Record<string, unknown>;
  evidenceRequired: boolean;
  isHeader: boolean;
}
export interface SeedTaxonomy {
  versionId: string;
  coreSubjects: SeedCoreSubject[];
  issues: SeedIssue[];
  keyConsiderations: SeedKeyConsideration[];
}

const YES_NO = { options: ['yes', 'no'] };

/**
 * Maps the workbook's answer/score columns to an answer type and scoring rule (M04 §4.1, §7.2, §7.3).
 * Rules come from the workbook text and the legacy FE components (IssueOfInterest.js).
 */
export function classifyAnswer(
  row: WorkbookRow,
): Pick<SeedKeyConsideration, 'answerType' | 'answerOptions' | 'scoringRule'> {
  const options = (row.answerOptions ?? '').toLowerCase();
  const scores = (row.backendScores ?? '').toLowerCase();

  if (row.dropdown === 0) return { answerType: 'header', answerOptions: {}, scoringRule: {} };

  if (options.includes('required by law')) {
    return {
      answerType: 'legal_3',
      answerOptions: { options: ['no', 'yes_by_law', 'yes_beyond_law'] },
      scoringRule: { no: 0, yes_by_law: 2, yes_beyond_law: 4 },
    };
  }
  if (options.includes('ask how many')) {
    return {
      answerType: 'yes_count',
      answerOptions: { ...YES_NO, count: true },
      scoringRule: { yes: 4, no: 0 },
    };
  }
  if (options.includes('grievances')) {
    return {
      answerType: 'ratio_band',
      answerOptions: {
        input: 'ratio',
        numerator: 'satisfactory_resolutions',
        denominator: 'grievances_reported',
      },
      scoringRule: { bands: [20, 40, 60, 80] },
    };
  }
  if (options.includes('local employees')) {
    return {
      answerType: 'ratio_band',
      answerOptions: { input: 'ratio', numerator: 'local_employees', denominator: 'total_employees' },
      scoringRule: { bands: [20, 40, 60, 80] },
    };
  }
  if (options.includes('locally sourced')) {
    return {
      answerType: 'ratio_band',
      answerOptions: { input: 'percent' },
      scoringRule: { bands: [20, 40, 60, 80] },
    };
  }
  if (options.includes('salary')) {
    return {
      answerType: 'gender_pay_gap',
      answerOptions: { tiers: ['top_management', 'management', 'workforce'] },
      scoringRule: { weights: [1, 1, 1], thresholds: { zero: 60, one: 41, two: 21, three: 1 } },
    };
  }
  if (options.startsWith('does not')) {
    return {
      answerType: 'yes_no',
      answerOptions: { options: ['yes', 'no'], labels: 'does' },
      scoringRule: { yes: 4, no: 0 },
    };
  }

  // Yes/No. Score column is "<yesScore> - Very good / 0 - Very poor" or inverted "0 - Very poor / 4 - Very good".
  if (/^\s*0 - very poor\s*\/\s*4/.test(scores)) {
    return { answerType: 'yes_no', answerOptions: YES_NO, scoringRule: { yes: 0, no: 4 } };
  }
  const legacyYes = Number(/^\s*(\d+)\s*-/.exec(scores)?.[1] ?? 4);
  return {
    answerType: 'yes_no',
    answerOptions: YES_NO,
    // Legacy rows scoring Yes as 5–10 are clamped to 0–4 (M04 §7.1 open question) and flagged for review.
    scoringRule:
      legacyYes > 4 ? { yes: 4, no: 0, legacyYesScore: legacyYes, needsReview: true } : { yes: 4, no: 0 },
  };
}

export function buildTaxonomy(rows: WorkbookRow[]): SeedTaxonomy {
  const versionId = uuidFromName(`taxonomy:${TAXONOMY_CODE}`);

  const coreSubjects: SeedCoreSubject[] = CORE_SUBJECTS.map((cs, i) => ({
    id: uuidFromName(`${TAXONOMY_CODE}:cs:${cs.key}`),
    key: cs.key,
    code: String(i + 1),
    sortOrder: i,
    label: cs.label,
  }));
  const csByKey = new Map(coreSubjects.map((c) => [c.key, c]));

  const issueCounters = new Map<string, number>();
  const issues: SeedIssue[] = ISSUES.map((issue) => {
    const cs = csByKey.get(issue.coreSubject);
    if (!cs) throw new Error(`Issue ${issue.key} references unknown core subject ${issue.coreSubject}`);
    const n = (issueCounters.get(cs.key) ?? 0) + 1;
    issueCounters.set(cs.key, n);
    return {
      id: uuidFromName(`${TAXONOMY_CODE}:issue:${issue.key}`),
      coreSubjectId: cs.id,
      key: issue.key,
      code: `${cs.code}_${n}`,
      sortOrder: n - 1,
      label: issue.label,
    };
  });
  const issueByKey = new Map(issues.map((i) => [i.key, i]));

  const seen = new Set<string>();
  const keyConsiderations = rows.map((row, index): SeedKeyConsideration => {
    const issue = issueByKey.get(row.issue);
    if (!issue) throw new Error(`Row ${index + 2}: unknown issue key ${row.issue}`);
    const cs = csByKey.get(row.coreSubject);
    if (!cs || cs.id !== issue.coreSubjectId)
      throw new Error(`Row ${index + 2}: issue ${row.issue} not under ${row.coreSubject}`);
    if (!row.code.startsWith(`${issue.code.split('_')[0]}_`)) {
      throw new Error(`Row ${index + 2}: code ${row.code} does not belong to core subject ${cs.code}`);
    }
    if (seen.has(row.code)) throw new Error(`Row ${index + 2}: duplicate code ${row.code}`);
    seen.add(row.code);
    const answer = classifyAnswer(row);
    const isHeader = answer.answerType === 'header';
    return {
      id: uuidFromName(`${TAXONOMY_CODE}:kc:${row.code}`),
      issueId: issue.id,
      code: row.code,
      legacyKey: `v_1_${row.code}`,
      sortOrder: index,
      groupIndex: row.groupBy,
      label: row.label.trim(),
      evidenceHint: row.evidenceHint?.trim() || null,
      ...answer,
      evidenceRequired: !isHeader,
      isHeader,
    };
  });

  return { versionId, coreSubjects, issues, keyConsiderations };
}

/** Converts raw sheet values (row arrays, header row excluded) into typed rows; skips blank lines. */
export function toWorkbookRows(values: unknown[][]): WorkbookRow[] {
  const str = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    throw new Error(`Unexpected cell value in workbook: ${JSON.stringify(v)}`);
  };
  const req = (v: unknown, column: string): string => {
    const s = str(v);
    if (s === null) throw new Error(`Missing ${column} in workbook row`);
    return s.trim();
  };
  return values
    .filter((r) => str(r[2]))
    .map((r) => ({
      coreSubject: req(r[0], 'Core Subject'),
      issue: req(r[1], 'Issue of Interest'),
      code: req(r[2], 'Code'),
      label: str(r[3]) ?? '',
      orderBy: Number(r[4] ?? 0),
      groupBy: Number(r[5] ?? 0),
      dropdown: Number(r[6] ?? 1),
      answerOptions: str(r[7]),
      backendScores: str(r[8]),
      evidenceHint: str(r[9]),
    }));
}
