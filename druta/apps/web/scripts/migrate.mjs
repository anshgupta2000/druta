import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { loadEnvFromFiles } from './load-env.mjs';

loadEnvFromFiles();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const sql = neon(databaseUrl);

const migrationsDir = path.resolve(process.cwd(), 'db', 'migrations');

const splitStatements = (input) => {
  const statements = [];
  let current = '';
  let i = 0;
  let quote = null;
  let dollarTag = null;
  let inLineComment = false;
  let inBlockComment = false;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    current = '';
  };

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      current += char;
      if (char === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (!quote && !dollarTag && char === '-' && next === '-') {
      current += char + next;
      i += 2;
      inLineComment = true;
      continue;
    }

    if (!quote && !dollarTag && char === '/' && next === '*') {
      current += char + next;
      i += 2;
      inBlockComment = true;
      continue;
    }

    if (!quote && !dollarTag && char === '$') {
      const dollarMatch = input.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (dollarMatch) {
        dollarTag = dollarMatch[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (dollarTag) {
      if (input.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += char;
      i += 1;
      continue;
    }

    if (!quote && (char === "'" || char === '"')) {
      quote = char;
      current += char;
      i += 1;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) {
        // Escaped quote, keep scanning in the same string.
        if (next === quote) {
          current += next;
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    if (char === ';') {
      flush();
      i += 1;
      continue;
    }

    current += char;
    i += 1;
  }

  flush();
  return statements;
};

const ensureMigrationsTable = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
};

const getAppliedMigrations = async () => {
  const rows = await sql`SELECT version FROM schema_migrations`;
  return new Set(rows.map((row) => row.version));
};

const run = async () => {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file} (already applied)`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const content = await fs.readFile(filePath, 'utf8');
    const statements = splitStatements(content);

    if (statements.length === 0) {
      console.log(`Skipping ${file} (empty migration)`);
      await sql`INSERT INTO schema_migrations (version) VALUES (${file})`;
      continue;
    }

    console.log(`Applying ${file} (${statements.length} statements)`);
    for (const statement of statements) {
      await sql(statement);
    }

    await sql`INSERT INTO schema_migrations (version) VALUES (${file})`;
    console.log(`Applied ${file}`);
  }

  console.log('Migration run complete.');
};

run().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
