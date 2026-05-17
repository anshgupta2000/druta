const DEFAULT_AUTH_TIMEOUT_MESSAGE =
  'Authentication is taking too long. Check your connection and try again.';

const shouldLogAuthDebug = () => {
  if (process.env.EXPO_PUBLIC_AUTH_DEBUG === 'false') return false;
  if (process.env.EXPO_PUBLIC_AUTH_DEBUG === 'true') return true;
  return typeof __DEV__ === 'undefined' ? true : __DEV__;
};

const maskEmail = (value) => {
  if (!value || typeof value !== 'string') return value;
  const [name, domain] = value.split('@');
  if (!domain) return value;
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? '***' : '*'}@${domain}`;
};

const looksLikeEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const maskURL = (value) => {
  if (typeof value !== 'string' || !/^https?:\/\//.test(value)) return value;
  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('token') ||
        lowerKey.includes('jwt') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('code') ||
        lowerKey.includes('ticket') ||
        lowerKey.includes('session')
      ) {
        url.searchParams.set(key, '[redacted]');
      }
    }
    return url.toString();
  } catch {
    return value;
  }
};

const maskSensitiveString = (key, value) => {
  const lowerKey = String(key).toLowerCase();
  if (
    lowerKey.includes('password') ||
    lowerKey.includes('token') ||
    lowerKey.includes('jwt') ||
    lowerKey.includes('secret') ||
    lowerKey.includes('code') ||
    lowerKey.includes('session')
  ) {
    return '[redacted]';
  }
  if (lowerKey.includes('email')) {
    return maskEmail(value);
  }
  return maskURL(value);
};

export const sanitizeForAuthLog = (value, depth = 0) => {
  if (value == null) return value;
  if (depth > 4) return '[max-depth]';
  if (typeof value === 'string') {
    if (looksLikeEmail(value)) return maskEmail(value);
    return maskURL(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitizeForAuthLog(item, depth + 1));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      status: value.status,
      errors: sanitizeForAuthLog(value.errors, depth + 1),
    };
  }
  if (typeof value === 'object') {
    const nextValue = {};
    for (const [key, childValue] of Object.entries(value)) {
      if (typeof childValue === 'function') continue;
      nextValue[key] =
        typeof childValue === 'string'
          ? maskSensitiveString(key, childValue)
          : sanitizeForAuthLog(childValue, depth + 1);
    }
    return nextValue;
  }
  return String(value);
};

export const authLog = (level, event, details) => {
  if (!shouldLogAuthDebug()) return;
  const logger = console[level] || console.log;
  const payload = sanitizeForAuthLog(details);
  if (payload === undefined) {
    logger.call(console, `[druta-auth] ${event}`);
    return;
  }
  logger.call(console, `[druta-auth] ${event}`, payload);
};

export const createAuthTimeoutError = (
  message = DEFAULT_AUTH_TIMEOUT_MESSAGE
) => {
  const error = new Error(message);
  error.name = 'AuthTimeoutError';
  error.code = 'AUTH_TIMEOUT';
  return error;
};

export const withLoggedAuthTimeout = async (
  label,
  operation,
  options = {}
) => {
  const timeoutMs = options.timeoutMs || 30000;
  const startedAt = Date.now();
  let timeoutId;
  let timedOut = false;

  const getDetails = () =>
    typeof options.getDetails === 'function' ? options.getDetails() : options.details;

  authLog('info', `${label}:start`, {
    timeoutMs,
    ...getDetails(),
  });

  const operationPromise = Promise.resolve()
    .then(operation)
    .then(
      (result) => {
        const durationMs = Date.now() - startedAt;
        authLog(timedOut ? 'warn' : 'info', `${label}:${timedOut ? 'late-success' : 'success'}`, {
          durationMs,
          result: summarizeAuthResult(result),
          ...getDetails(),
        });
        return result;
      },
      (error) => {
        const durationMs = Date.now() - startedAt;
        authLog(timedOut ? 'error' : 'warn', `${label}:${timedOut ? 'late-error' : 'error'}`, {
          durationMs,
          error,
          ...getDetails(),
        });
        throw error;
      }
    );

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutError = createAuthTimeoutError();
      authLog('warn', `${label}:timeout`, {
        durationMs: Date.now() - startedAt,
        timeoutMs,
        ...getDetails(),
      });
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const summarizeAuthResult = (result) => {
  if (!result || typeof result !== 'object') return result;
  return {
    status: result.status,
    createdSessionId: result.createdSessionId ? '[present]' : undefined,
    error: result.error,
    missingFields: result.missingFields,
    requiredFields: result.requiredFields,
    unverifiedFields: result.unverifiedFields,
    verifications: result.verifications
      ? Object.keys(result.verifications).reduce((summary, key) => {
          const value = result.verifications[key];
          summary[key] =
            value && typeof value === 'object'
              ? {
                  status: value.status,
                  strategy: value.strategy,
                  nextAction: value.nextAction,
                }
              : value;
          return summary;
        }, {})
      : undefined,
  };
};

export const getClerkResourceSnapshot = (resource) => {
  if (!resource) return null;
  return {
    status: resource.status,
    requiredFields: resource.requiredFields,
    missingFields: resource.missingFields,
    optionalFields: resource.optionalFields,
    unverifiedFields: resource.unverifiedFields,
    supportedFirstFactors: resource.supportedFirstFactors?.map((factor) => ({
      strategy: factor.strategy,
      safeIdentifier: factor.safeIdentifier,
    })),
    supportedSecondFactors: resource.supportedSecondFactors?.map((factor) => ({
      strategy: factor.strategy,
      safeIdentifier: factor.safeIdentifier,
    })),
    verifications: summarizeAuthResult(resource).verifications,
  };
};
