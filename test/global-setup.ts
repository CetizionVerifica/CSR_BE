import { execSync } from 'node:child_process';

/** Brings the test database to the latest migration and loads reference data once per run. */
export default function setup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://resilisense:resilisense@localhost:5432/resilisense_test';
  const env = { ...process.env, DATABASE_URL: url };
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npm run -s db:seed', { stdio: 'inherit', env });
}
