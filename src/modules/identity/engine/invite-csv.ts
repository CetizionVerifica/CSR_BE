import { MEMBERSHIP_ROLES, type MembershipRoleName } from '../../../common/auth/principal';
import { UUID_RE } from '../../../common/ids';

/** Bulk invite CSV (M01 §7.1): header `email,role,company_ids,project_ids`, ids separated by `;`. */
export const INVITE_CSV = { maxRows: 200, header: ['email', 'role', 'company_ids', 'project_ids'] } as const;

export interface InviteRow {
  email: string;
  role: MembershipRoleName;
  companyIds: string[];
  projectIds: string[];
}

export interface CsvIssue {
  line: number;
  message: string;
}

/** RFC 4180 subset: comma separator, double-quoted fields with "" escapes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ids(cell: string | undefined, line: number, name: string, issues: CsvIssue[]): string[] {
  const list = (cell ?? '')
    .split(';')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  for (const id of list) if (!UUID_RE.test(id)) issues.push({ line, message: `${name}: invalid id` });
  return [...new Set(list)];
}

export function parseInviteCsv(text: string): { rows: InviteRow[]; issues: CsvIssue[] } {
  const table = parseCsv(text);
  const issues: CsvIssue[] = [];
  const [header, ...body] = table;
  const normalised = (header ?? []).map((h) => h.trim().toLowerCase());
  if (normalised.join(',') !== INVITE_CSV.header.join(',')) {
    return { rows: [], issues: [{ line: 1, message: `header must be ${INVITE_CSV.header.join(',')}` }] };
  }
  if (body.length === 0) return { rows: [], issues: [{ line: 2, message: 'no rows' }] };
  if (body.length > INVITE_CSV.maxRows) {
    return { rows: [], issues: [{ line: 1, message: `at most ${INVITE_CSV.maxRows} rows` }] };
  }
  const rows: InviteRow[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const line = i + 2;
    const email = (cells[0] ?? '').trim().toLowerCase();
    const role = (cells[1] ?? '').trim() as MembershipRoleName;
    if (!EMAIL_RE.test(email) || email.length > 254) issues.push({ line, message: 'email: invalid' });
    else if (seen.has(email)) issues.push({ line, message: 'email: duplicate' });
    if (!MEMBERSHIP_ROLES.includes(role)) issues.push({ line, message: 'role: invalid' });
    const companyIds = ids(cells[2], line, 'company_ids', issues);
    const projectIds = ids(cells[3], line, 'project_ids', issues);
    seen.add(email);
    rows.push({ email, role, companyIds, projectIds });
  });
  return issues.length ? { rows: [], issues } : { rows, issues };
}
