const AUTH_PROTOCOL_REGEX = /^https?:\/\//i;
const LOCAL_HOST_REGEX =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i;

const stripLeadingSlashes = (value) => value.replace(/^\/+/, "");

const toHost = (value) => {
  const cleaned = stripLeadingSlashes(value);
  return cleaned.split("/")[0]?.toLowerCase() || "";
};

export const normalizeAuthUrl = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (AUTH_PROTOCOL_REGEX.test(trimmed)) {
    return trimmed;
  }

  const host = toHost(trimmed);
  const protocol = LOCAL_HOST_REGEX.test(host) ? "http" : "https";
  return `${protocol}://${stripLeadingSlashes(trimmed)}`;
};

export const getNormalizedAuthUrl = () => normalizeAuthUrl(process.env.AUTH_URL);

export const hasHostedAuthConfig = () =>
  Boolean(process.env.AUTH_SECRET && getNormalizedAuthUrl());

export const getSecureCookieFlag = () =>
  Boolean(getNormalizedAuthUrl()?.startsWith("https://"));

export const ensureAuthUrlEnv = () => {
  const normalized = getNormalizedAuthUrl();
  if (normalized && process.env.AUTH_URL !== normalized) {
    process.env.AUTH_URL = normalized;
  }
  return normalized;
};
