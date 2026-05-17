import * as SecureStore from 'expo-secure-store';
import { fetch as expoFetch } from 'expo/fetch';
import { handleLocalApiRequest, shouldUseLocalApiFallback } from './local-api';
import { authLog } from '../utils/auth/debug';
import { getFreshClerkToken } from '../utils/auth/clerk-token';

const originalFetch = fetch;
const authKey = `${process.env.EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`;

const getURLFromArgs = (...args: Parameters<typeof fetch>) => {
  const [urlArg] = args;
  let url: string | null;
  if (typeof urlArg === 'string') {
    url = urlArg;
  } else if (urlArg instanceof URL) {
    url = urlArg.href;
  } else if (typeof urlArg === 'object' && urlArg !== null) {
    url = 'url' in urlArg && typeof urlArg.url === 'string' ? urlArg.url : null;
  } else {
    url = null;
  }
  return url;
};

const isFileURL = (url: string) => {
  return url.startsWith('file://') || url.startsWith('data:');
};

const isFirstPartyURL = (url: string) => {
  return (
    url.startsWith('/') ||
    (process.env.EXPO_PUBLIC_BASE_URL && url.startsWith(process.env.EXPO_PUBLIC_BASE_URL))
  );
};

const isSecondPartyURL = (url: string) => {
  return url.startsWith('/_create/');
};

const isClerkURL = (url: string) => {
  return (
    url.includes('clerk.') ||
    url.includes('clerk.com') ||
    url.includes('clerk.dev') ||
    url.includes('/v1/client') ||
    url.includes('/v1/me')
  );
};

const getExternalFetchInput = (
  input: Parameters<typeof expoFetch>[0],
  url: string
) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return url;
  if (
    typeof input === 'object' &&
    input !== null &&
    'href' in input &&
    typeof input.href === 'string'
  ) {
    return url;
  }
  return input;
};

const fetchWithAuthLogging = async (
  input: Parameters<typeof expoFetch>[0],
  init: Parameters<typeof expoFetch>[1],
  details: { url: string; route: string },
  fetcher: typeof fetch = expoFetch
) => {
  const startedAt = Date.now();
  authLog('info', 'fetch:start', {
    ...details,
    method: init?.method || 'GET',
  });
  try {
    const response = await fetcher(input, init);
    authLog('info', 'fetch:response', {
      ...details,
      durationMs: Date.now() - startedAt,
      status: response.status,
      ok: response.ok,
    });
    return response;
  } catch (error) {
    authLog('warn', 'fetch:error', {
      ...details,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
};

const getStoredAuth = async () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const localValue = window.localStorage.getItem(authKey);
    if (localValue) {
      try {
        return JSON.parse(localValue);
      } catch {}
    }
  }

  try {
    const secureValue = await SecureStore.getItemAsync(authKey);
    if (secureValue) {
      return JSON.parse(secureValue);
    }
  } catch {}

  return null;
};

type Params = Parameters<typeof expoFetch>;
const fetchToWeb = async function fetchWithHeaders(...args: Params) {
  const firstPartyURL = process.env.EXPO_PUBLIC_BASE_URL;
  const secondPartyURL = process.env.EXPO_PUBLIC_PROXY_BASE_URL;
  const [input, init] = args;
  const url = getURLFromArgs(input, init);
  if (!url) {
    return expoFetch(input, init);
  }

  if (isFileURL(url)) {
    return originalFetch(input, init);
  }

  const isExternalFetch = !isFirstPartyURL(url);
  // we should not add headers to requests that don't go to our own server
  if (isExternalFetch) {
    if (isClerkURL(url)) {
      return fetchWithAuthLogging(
        getExternalFetchInput(input, url),
        init,
        { url, route: 'clerk-external' },
        originalFetch
      );
    }
    return expoFetch(input, init);
  }

  const storedAuth = await getStoredAuth();
  const freshClerkToken = await getFreshClerkToken();
  const auth = freshClerkToken
    ? { ...(storedAuth || {}), jwt: freshClerkToken }
    : storedAuth;

  if (shouldUseLocalApiFallback()) {
    const localResponse = await handleLocalApiRequest({ url, init, auth });
    if (localResponse) {
      return localResponse;
    }
  }

  let finalInput = input;
  const baseURL = isSecondPartyURL(url)
    ? secondPartyURL || firstPartyURL
    : firstPartyURL;
  if (typeof input === 'string') {
    if (input.startsWith('/')) {
      if (!baseURL) {
        throw new Error(
          'Missing EXPO_PUBLIC_BASE_URL. Set EXPO_PUBLIC_BASE_URL and EXPO_PUBLIC_PROXY_BASE_URL to your web API origin.'
        );
      }
      finalInput = `${baseURL}${input}`;
    } else {
      finalInput = input;
    }
  } else {
    return expoFetch(input, init);
  }

  const initHeaders = init?.headers ?? {};
  const finalHeaders = new Headers(initHeaders);

  const headers = {
    'x-createxyz-project-group-id': process.env.EXPO_PUBLIC_PROJECT_GROUP_ID,
    host: process.env.EXPO_PUBLIC_HOST,
    'x-forwarded-host': process.env.EXPO_PUBLIC_HOST,
    'x-createxyz-host': process.env.EXPO_PUBLIC_HOST,
  };

  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      finalHeaders.set(key, value);
    }
  }

  if (auth) {
    finalHeaders.set('authorization', `Bearer ${auth.jwt}`);
  }

  const finalInit = {
    ...init,
    headers: finalHeaders,
  };

  if (isClerkURL(url) || isClerkURL(String(finalInput))) {
    return fetchWithAuthLogging(finalInput, finalInit, {
      url: String(finalInput),
      route: 'clerk-first-party',
    });
  }

  return expoFetch(finalInput, finalInit);
};

export default fetchToWeb;
