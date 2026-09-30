import { buildTaxonomy, classifyAnswer, type SeedTaxonomy, type WorkbookRow } from './taxonomy';
import { readWorkbookRows } from './workbook';

// Assertions from docs/revamp/modules/M13-platform-admin-content.md §7 and M04 §11.
describe('ISO 26000 taxonomy seed', () => {
  let taxonomy: SeedTaxonomy;

  beforeAll(async () => {
    taxonomy = buildTaxonomy(await readWorkbookRows());
  });

  it('has 7 core subjects and 41 issues (5/8/5/4/5/7/7)', () => {
    expect(taxonomy.coreSubjects).toHaveLength(7);
    expect(taxonomy.issues).toHaveLength(41);
    const perSubject = taxonomy.coreSubjects.map(
      (cs) => taxonomy.issues.filter((i) => i.coreSubjectId === cs.id).length,
    );
    expect(perSubject).toEqual([5, 8, 5, 4, 5, 7, 7]);
  });

  it('has 609 key considerations with the per-core-subject counts', () => {
    expect(taxonomy.keyConsiderations).toHaveLength(609);
    const issueToCs = new Map(taxonomy.issues.map((i) => [i.id, i.coreSubjectId]));
    const counts = taxonomy.coreSubjects.map(
      (cs) => taxonomy.keyConsiderations.filter((kc) => issueToCs.get(kc.issueId) === cs.id).length,
    );
    expect(counts).toEqual([42, 105, 103, 74, 87, 142, 56]);
  });

  it('marks 25 header rows and 584 scored rows', () => {
    expect(taxonomy.keyConsiderations.filter((kc) => kc.isHeader)).toHaveLength(25);
    expect(taxonomy.keyConsiderations.filter((kc) => !kc.isHeader && kc.evidenceRequired)).toHaveLength(584);
  });

  it('keeps legacy keys (v_1_<code>) unique and stable ids', () => {
    const keys = new Set(taxonomy.keyConsiderations.map((kc) => kc.legacyKey));
    expect(keys.size).toBe(609);
    expect(taxonomy.keyConsiderations[0]).toMatchObject({ code: '1_1_1', legacyKey: 'v_1_1_1_1' });
    expect(buildTaxonomy([]).versionId).toBe(taxonomy.versionId);
  });

  it('preserves legacy issue keys including historical typos', () => {
    const keys = taxonomy.issues.map((i) => i.key);
    expect(keys).toContain('avoindanceOfComplicity');
    expect(keys).toContain('resolvingGievances');
  });

  it('classifies the special answer types from M04 §4.1', () => {
    const byCode = new Map(taxonomy.keyConsiderations.map((kc) => [kc.code, kc]));
    expect(byCode.get('1_2_3')?.answerType).toBe('legal_3');
    expect(byCode.get('3_2_14')?.answerType).toBe('legal_3');
    expect(byCode.get('1_5_1')?.answerType).toBe('yes_count');
    expect(byCode.get('2_4_3')?.answerType).toBe('ratio_band');
    expect(byCode.get('7_5_1')?.answerType).toBe('ratio_band');
    expect(byCode.get('7_5_2')?.answerOptions).toEqual({ input: 'percent' });
    expect(byCode.get('3_2_19')?.answerType).toBe('gender_pay_gap');
    expect(byCode.get('5_2_4')?.answerOptions).toMatchObject({ labels: 'does' });
    expect(byCode.get('3_2_18')?.scoringRule).toEqual({ yes: 0, no: 4 });
    const flagged = taxonomy.keyConsiderations
      .filter((kc) => kc.scoringRule['needsReview'])
      .map((kc) => kc.code);
    expect(flagged).toEqual(['1_5_20_2', '1_5_20_3', '1_5_20_4', '1_5_20_5', '1_5_20_6', '1_5_20_7']);
  });
});

describe('classifyAnswer', () => {
  const row = (over: Partial<WorkbookRow>): WorkbookRow => ({
    coreSubject: 'organizationalGovernance',
    issue: 'ethicalConduct',
    code: '1_1_1',
    label: 'x',
    orderBy: 0,
    groupBy: 0,
    dropdown: 1,
    answerOptions: 'Yes / No',
    backendScores: '4 - Very good / 0 - Very poor',
    evidenceHint: null,
    ...over,
  });

  it('defaults to yes/no 4/0', () => {
    expect(classifyAnswer(row({}))).toEqual({
      answerType: 'yes_no',
      answerOptions: { options: ['yes', 'no'] },
      scoringRule: { yes: 4, no: 0 },
    });
  });

  it('treats dropdown 0 as a header', () => {
    expect(classifyAnswer(row({ dropdown: 0 })).answerType).toBe('header');
  });
});
