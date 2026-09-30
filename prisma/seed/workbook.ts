import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { toWorkbookRows, type WorkbookRow } from './taxonomy';

export const WORKBOOK_PATH = join(__dirname, '..', '..', 'Docs', 'GapAnalysisV2.xlsx');

/** Reads the first sheet ("GapAnalysis v3 PS") of the legacy question workbook. */
export async function readWorkbookRows(path = WORKBOOK_PATH): Promise<WorkbookRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error(`No worksheet in ${path}`);
  const values: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const cells = row.values as unknown[]; // 1-based
    values.push(
      cells.slice(1, 11).map((v) => {
        if (v && typeof v === 'object' && 'richText' in v) {
          return (v as { richText: Array<{ text: string }> }).richText.map((t) => t.text).join('');
        }
        return v;
      }),
    );
  });
  return toWorkbookRows(values);
}
