import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAuthStore } from './store';

const callbackUrl = '/api/auth/token';
const callbackQueryString = `callbackUrl=${callbackUrl}`;
const callbackFailure = 'Callback';

const toOrigin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * This renders a WebView for authentication and handles both web and native platforms.
 */
export const AuthWebView = ({ mode, proxyURL, baseURL }) => {
  const [currentURI, setURI] = useState(`${baseURL}/account/${mode}?${callbackQueryString}`);
  const { auth, setAuth, isReady } = useAuthStore();
  const isAuthenticated = isReady ? !!auth : null;
  const iframeRef = useRef(null);

  const allowedOrigins = useMemo(() => {
    return [proxyURL, baseURL].filter(Boolean).map(toOrigin).filter(Boolean);
  }, [baseURL, proxyURL]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (isAuthenticated) {
      router.back();
    }
  }, [isAuthenticated]);
  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    setURI(`${baseURL}/account/${mode}?${callbackQueryString}`);
  }, [mode, baseURL, isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) {
      return;
    }

    const handleMessage = (event) => {
      // Verify the origin for security
      if (!allowedOrigins.includes(event.origin)) {
        return;
      }
      const eventData = event?.data;
      if (eventData?.type === 'AUTH_SUCCESS') {
        setAuth({
          jwt: eventData.jwt,
          user: eventData.user,
        });
      } else if (eventData?.type === 'AUTH_ERROR') {
        console.error('Auth error:', eventData.error);
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [allowedOrigins, setAuth]);

  if (Platform.OS === 'web') {
    const handleIframeError = () => {
      console.error('Failed to load auth iframe');
    };

    return (
      <iframe
        ref={iframeRef}
        title="Authentication"
        src={`${proxyURL}/account/${mode}?callbackUrl=/api/auth/expo-web-success`}
        style={{ width: '100%', height: '100%', border: 'none' }}
        onError={handleIframeError}
      />
    );
  }

  const shouldInjectCreateHeaders = Boolean(
    process.env.EXPO_PUBLIC_HOST &&
      process.env.EXPO_PUBLIC_BASE_URL &&
      baseURL &&
      baseURL.includes(process.env.EXPO_PUBLIC_HOST)
  );

  const requestHeaders = useMemo(() => {
    if (!shouldInjectCreateHeaders) {
      return undefined;
    }
    return {
      'x-createxyz-project-group-id': process.env.EXPO_PUBLIC_PROJECT_GROUP_ID,
      host: process.env.EXPO_PUBLIC_HOST,
      'x-forwarded-host': process.env.EXPO_PUBLIC_HOST,
      'x-createxyz-host': process.env.EXPO_PUBLIC_HOST,
    };
  }, [shouldInjectCreateHeaders]);

  const redirectToAuthPage = useCallback(() => {
    try {
      const nextUrl = new URL(`/account/${mode}`, baseURL);
      nextUrl.searchParams.set('callbackUrl', callbackUrl);
      nextUrl.searchParams.set('error', callbackFailure);
      setURI(nextUrl.toString());
      return;
    } catch {}
    setURI(`${baseURL}/account/${mode}?${callbackQueryString}&error=${callbackFailure}`);
  }, [baseURL, mode]);

  const completeTokenExchange = useCallback(
    async (url) => {
      try {
        const response = await fetch(url, {
          ...(requestHeaders ? { headers: requestHeaders } : {}),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user?.id || typeof data?.jwt !== 'string') {
          console.error('Auth token exchange failed:', response.status, data);
          redirectToAuthPage();
          return;
        }
        setAuth({ jwt: data.jwt, user: data.user });
      } catch (error) {
        console.error('Auth token exchange failed:', error);
        redirectToAuthPage();
      }
    },
    [redirectToAuthPage, requestHeaders, setAuth]
  );

  const onShouldStartLoadWithRequest = useCallback(
    (request) => {
      const requestedUrl = request?.url;
      if (!requestedUrl || !/^https?:\/\//i.test(requestedUrl)) {
        return true;
      }

      const normalizedUrl =
        proxyURL && baseURL ? requestedUrl.replaceAll(proxyURL, baseURL) : requestedUrl;
      let parsedURL;
      try {
        parsedURL = new URL(normalizedUrl);
      } catch {
        return true;
      }

      if (!allowedOrigins.includes(parsedURL.origin)) {
        return true;
      }

      if (parsedURL.pathname === callbackUrl) {
        completeTokenExchange(parsedURL.toString());
        return false;
      }

      parsedURL.searchParams.set('callbackUrl', callbackUrl);
      const nextUrl = parsedURL.toString();
      if (nextUrl === currentURI) {
        return true;
      }
      setURI(nextUrl);
      return false;
    },
    [allowedOrigins, baseURL, completeTokenExchange, currentURI, proxyURL]
  );

  return (
    <WebView
      sharedCookiesEnabled
      source={{
        uri: currentURI,
        ...(requestHeaders ? { headers: requestHeaders } : {}),
      }}
      onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      style={{ flex: 1 }}
    />
  );
};
