import fs from 'node:fs';
import path from 'node:path';

const stripWrappingQuotes = (value) => {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

const parseLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const index = trimmed.indexOf('=');
  if (index <= 0) {
    return null;
  }

  const key = trimmed.slice(0, index).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const rawValue = trimmed.slice(index + 1).trim();
  const value = stripWrappingQuotes(rawValue);
  return { key, value };
};

export const loadEnvFromFiles = ({
  cwd = process.cwd(),
  files = ['.env.local', '.env'],
} = {}) => {
  for (const file of files) {
    const target = path.resolve(cwd, file);
    if (!fs.existsSync(target)) {
      continue;
    }

    const content = fs.readFileSync(target, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) {
        continue;
      }
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
};
