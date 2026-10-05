import { parseCsv, parseInviteCsv } from './invite-csv';

const C1 = '01920000-0000-7000-8000-000000000001';
const C2 = '01920000-0000-7000-8000-000000000002';

describe('CSV parsing', () => {
  it('handles quotes, escaped quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,"b,c","d""e"\r\n\r\nf,,g\n')).toEqual([
      ['a', 'b,c', 'd"e'],
      ['f', '', 'g'],
    ]);
  });
});

describe('bulk invite CSV (M01 §7.1)', () => {
  const header = 'email,role,company_ids,project_ids\n';

  it('parses rows, lower-cases emails and dedupes ids', () => {
    const { rows, issues } = parseInviteCsv(
      `${header}Jane@Example.com,contributor,"${C1};${C2};${C1}",\nbob@example.com,viewer,,\n`,
    );
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      { email: 'jane@example.com', role: 'contributor', companyIds: [C1, C2], projectIds: [] },
      { email: 'bob@example.com', role: 'viewer', companyIds: [], projectIds: [] },
    ]);
  });

  it.each([
    ['wrong header', 'mail,role\nx@y.z,viewer', 1, 'header'],
    ['no rows', header, 2, 'no rows'],
    ['bad email', `${header}nope,viewer,,`, 2, 'email: invalid'],
    ['bad role', `${header}a@b.co,platform_owner,,`, 2, 'role: invalid'],
    ['partner_admin is not a membership role', `${header}a@b.co,partner_admin,,`, 2, 'role: invalid'],
    ['bad company id', `${header}a@b.co,viewer,123,`, 2, 'company_ids: invalid id'],
    ['duplicate email', `${header}a@b.co,viewer,,\nA@b.co,viewer,,`, 3, 'email: duplicate'],
  ])('%s', (_name, csv, line, message) => {
    const { rows, issues } = parseInviteCsv(csv);
    expect(rows).toEqual([]);
    expect(issues[0]!.line).toBe(line);
    expect(issues[0]!.message).toContain(message);
  });

  it('caps at 200 rows', () => {
    const body = Array.from({ length: 201 }, (_, i) => `u${i}@example.com,viewer,,`).join('\n');
    expect(parseInviteCsv(header + body).issues[0]!.message).toContain('at most 200');
  });

  it('rejects an empty file as a missing header', () => {
    expect(parseInviteCsv('').issues).toEqual([
      { line: 1, message: expect.stringContaining('header must be') },
    ]);
  });

  it('treats missing trailing cells as empty: no ids, and a row without a role is invalid', () => {
    expect(parseInviteCsv(header + 'a@example.com,viewer').rows).toEqual([
      { email: 'a@example.com', role: 'viewer', companyIds: [], projectIds: [] },
    ]);
    expect(parseInviteCsv(header + 'a@example.com').issues).toEqual([{ line: 2, message: 'role: invalid' }]);
  });
});
