/**
 * Reference-data seed (idempotent). Run: `npm run db:seed` (also `prisma migrate reset`).
 * Seeds only global reference data — never tenant data. Re-running upserts by stable ids.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { COUNTRIES, SECTORS } from './reference';
import { buildTaxonomy, TAXONOMY_CODE } from './taxonomy';
import { readWorkbookRows } from './workbook';

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const t = buildTaxonomy(await readWorkbookRows());
    await prisma.$transaction(
      async (tx) => {
        await tx.taxonomyVersion.upsert({
          where: { id: t.versionId },
          create: { id: t.versionId, code: TAXONOMY_CODE, status: 'published', publishedAt: new Date() },
          update: {},
        });
        for (const cs of t.coreSubjects) {
          await tx.coreSubject.upsert({
            where: { id: cs.id },
            create: { ...cs, versionId: t.versionId },
            update: { label: cs.label, sortOrder: cs.sortOrder },
          });
        }
        for (const issue of t.issues) {
          await tx.issue.upsert({
            where: { id: issue.id },
            create: { ...issue, versionId: t.versionId },
            update: { label: issue.label, sortOrder: issue.sortOrder },
          });
        }
        for (const kc of t.keyConsiderations) {
          const data = {
            ...kc,
            answerType: kc.answerType,
            answerOptions: kc.answerOptions as object,
            scoringRule: kc.scoringRule as object,
          };
          await tx.keyConsideration.upsert({
            where: { id: kc.id },
            create: { ...data, versionId: t.versionId },
            update: {
              label: data.label,
              evidenceHint: data.evidenceHint,
              sortOrder: data.sortOrder,
              groupIndex: data.groupIndex,
              answerType: data.answerType,
              answerOptions: data.answerOptions,
              scoringRule: data.scoringRule,
              evidenceRequired: data.evidenceRequired,
              isHeader: data.isHeader,
            },
          });
        }
      },
      { timeout: 120_000 },
    );
    await prisma.$transaction(async (tx) => {
      for (const s of SECTORS) {
        const data = {
          parentCode: s.parentCode,
          label: s.label,
          labelKey: `sector.${s.code}`,
          sortOrder: s.sortOrder,
        };
        await tx.sector.upsert({ where: { code: s.code }, create: { code: s.code, ...data }, update: data });
      }
      for (const c of COUNTRIES) {
        const data = { region: c.region, labelKey: `country.${c.code}` };
        await tx.country.upsert({ where: { code: c.code }, create: { code: c.code, ...data }, update: data });
      }
    });
    console.log(`Seeded reference data: ${SECTORS.length} sectors, ${COUNTRIES.length} countries`);
    console.log(
      `Seeded ${TAXONOMY_CODE}: ${t.coreSubjects.length} core subjects, ${t.issues.length} issues, ${t.keyConsiderations.length} key considerations`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
