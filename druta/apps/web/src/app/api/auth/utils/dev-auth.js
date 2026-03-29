const DEV_AUTH_COOKIE = 'druta_dev_auth';

const encodePayload = (payload) => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const decodePayload = (value) => {
  try {
    const text = Buffer.from(value, 'base64url').toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const getCookieValue = (request, name) => {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!entry) return null;
  return entry.slice(name.length + 1);
};

const normalizeUser = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.user || typeof payload.user !== 'object') return null;

  const user = payload.user;
  if (!user.id || !user.email) return null;

  return {
    jwt:
      payload.jwt ||
      `dev-auth-token:${user.id}:${Math.floor(Date.now() / 1000)}`,
    user: {
      id: user.id,
      email: user.email,
      name: user.name || user.email.split('@')[0],
    },
  };
};

export const getDevAuthSession = (request) => {
  const encoded = getCookieValue(request, DEV_AUTH_COOKIE);
  if (!encoded) return null;
  return normalizeUser(decodePayload(encoded));
};

export const buildDevAuthCookie = (session, secure = false) => {
  const encoded = encodePayload(session);
  return `${DEV_AUTH_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? '; Secure' : ''}`;
};

export const clearDevAuthCookie = (secure = false) => {
  return `${DEV_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
};

export const createDevAuthSession = ({ email, name }) => {
  const normalizedEmail =
    typeof email === 'string' && email.trim().length > 0
      ? email.trim().toLowerCase()
      : `runner-${Date.now()}@druta.local`;
  const userId = `dev-${normalizedEmail.replace(/[^a-z0-9]+/g, '-')}`;
  const displayName =
    typeof name === 'string' && name.trim().length > 0
      ? name.trim()
      : normalizedEmail.split('@')[0];

  return {
    jwt: `dev-auth-token:${userId}:${Math.floor(Date.now() / 1000)}`,
    user: {
      id: userId,
      email: normalizedEmail,
      name: displayName,
    },
  };
};
