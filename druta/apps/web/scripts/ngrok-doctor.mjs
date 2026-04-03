import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const webDir = process.cwd();
const mobileDir = path.resolve(webDir, '..', 'mobile');
const webEnvPath = path.resolve(webDir, '.env');
const mobileEnvPath = path.resolve(mobileDir, '.env');

const readEnvValue = (filePath, key) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const line = content
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`));
  if (!line) {
    return null;
  }
  return line.slice(key.length + 1).trim();
};

const fetchJson = async (url, timeoutMs = 4000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, status: response.status, body: await response.text() };
    }
    return { ok: true, status: response.status, body: await response.json() };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
};

const run = async () => {
  const tunnelCheck = await fetchJson('http://127.0.0.1:4040/api/tunnels');
  if (!tunnelCheck.ok) {
    console.error('ngrok inspector is not reachable at http://127.0.0.1:4040.');
    console.error('Start ngrok first: bun run ngrok:start-free');
    process.exit(1);
  }

  const tunnel = (tunnelCheck.body?.tunnels || []).find(
    (entry) => typeof entry?.public_url === 'string' && entry.public_url.startsWith('https://')
  );
  if (!tunnel) {
    console.error('No HTTPS ngrok tunnel found. Start ngrok first.');
    process.exit(1);
  }

  const publicUrl = tunnel.public_url.replace(/\/+$/, '');
  const publicHealth = `${publicUrl}/api/healthz`;
  const localHealth = 'http://127.0.0.1:3000/api/healthz';

  const localCheck = await fetchJson(localHealth);
  if (!localCheck.ok) {
    console.error(`Local API is not healthy at ${localHealth}`);
    console.error(
      'Common cause: you just ran ngrok:sync-env, which updates .env and makes react-router dev exit for restart.'
    );
    console.error('Start web API first: bun run dev --host 0.0.0.0 --port 3000');
    if (localCheck.status) {
      console.error(`Status: ${localCheck.status}`);
    }
    if (localCheck.error) {
      console.error(`Error: ${localCheck.error}`);
    }
    process.exit(1);
  }

  const configuredAuthUrl = readEnvValue(webEnvPath, 'AUTH_URL');
  const configuredBaseUrl = readEnvValue(mobileEnvPath, 'EXPO_PUBLIC_BASE_URL');
  const configuredProxyUrl = readEnvValue(mobileEnvPath, 'EXPO_PUBLIC_PROXY_BASE_URL');

  const mismatches = [];
  if (configuredAuthUrl !== publicUrl) {
    mismatches.push(`AUTH_URL is ${configuredAuthUrl || '(missing)'}`);
  }
  if (configuredBaseUrl !== publicUrl) {
    mismatches.push(`EXPO_PUBLIC_BASE_URL is ${configuredBaseUrl || '(missing)'}`);
  }
  if (configuredProxyUrl !== publicUrl) {
    mismatches.push(`EXPO_PUBLIC_PROXY_BASE_URL is ${configuredProxyUrl || '(missing)'}`);
  }

  console.log(`ngrok URL: ${publicUrl}`);
  console.log(`Local check: ${localHealth}`);
  console.log(`Public check: ${publicHealth}`);

  if (mismatches.length > 0) {
    console.error('\nEnv mismatch detected:');
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    console.error('\nRun this, then restart web + mobile:');
    console.error('bun run ngrok:sync-env');
    process.exit(1);
  }

  console.log('\nStatus: ready for phone testing.');
};

run().catch((error) => {
  console.error(`ngrok doctor failed: ${error.message}`);
  process.exit(1);
});
