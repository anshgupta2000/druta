import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(process.cwd(), "..");
const webEnvPath = path.resolve(process.cwd(), ".env");
const mobileEnvPath = path.resolve(projectRoot, "mobile", ".env");

const getTunnelUrl = async () => {
  const response = await fetch("http://127.0.0.1:4040/api/tunnels");
  if (!response.ok) {
    throw new Error(`ngrok inspector returned ${response.status}`);
  }
  const payload = await response.json();
  const httpsTunnel = (payload?.tunnels || []).find(
    (tunnel) => typeof tunnel?.public_url === "string" && tunnel.public_url.startsWith("https://"),
  );
  if (!httpsTunnel) {
    throw new Error("No HTTPS ngrok tunnel found. Start ngrok first.");
  }
  return httpsTunnel.public_url.replace(/\/+$/, "");
};

const upsertEnvValue = (content, key, value) => {
  const line = `${key}=${value}`;
  const matcher = new RegExp(`^${key}=.*$`, "m");
  if (matcher.test(content)) {
    return content.replace(matcher, line);
  }
  const hasTrailingNewline = content.endsWith("\n");
  return `${content}${hasTrailingNewline ? "" : "\n"}${line}\n`;
};

const run = async () => {
  const url = await getTunnelUrl();
  const host = url.replace(/^https?:\/\//, "");

  const [webEnvRaw, mobileEnvRaw] = await Promise.all([
    fs.readFile(webEnvPath, "utf8"),
    fs.readFile(mobileEnvPath, "utf8"),
  ]);

  let nextWebEnv = webEnvRaw;
  nextWebEnv = upsertEnvValue(nextWebEnv, "AUTH_URL", url);

  let nextMobileEnv = mobileEnvRaw;
  nextMobileEnv = upsertEnvValue(nextMobileEnv, "EXPO_PUBLIC_BASE_URL", url);
  nextMobileEnv = upsertEnvValue(nextMobileEnv, "EXPO_PUBLIC_PROXY_BASE_URL", url);
  nextMobileEnv = upsertEnvValue(nextMobileEnv, "EXPO_PUBLIC_HOST", host);

  await Promise.all([
    fs.writeFile(webEnvPath, nextWebEnv, "utf8"),
    fs.writeFile(mobileEnvPath, nextMobileEnv, "utf8"),
  ]);

  console.log(`Synced envs to active ngrok URL: ${url}`);
  console.log(`AUTH_URL=${url}`);
  console.log(`EXPO_PUBLIC_BASE_URL=${url}`);
  console.log(`EXPO_PUBLIC_PROXY_BASE_URL=${url}`);
  console.log(`Health check URL: ${url}/api/healthz`);
  console.log(
    'Note: updating web .env may stop the running dev server. If it exits, restart: bun run dev --host 0.0.0.0 --port 3000'
  );
};

run().catch((error) => {
  console.error(`Failed to sync ngrok envs: ${error.message}`);
  process.exit(1);
});
