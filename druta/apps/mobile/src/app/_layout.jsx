import { useAuth } from '@/utils/auth/useAuth';
import { authLog } from '@/utils/auth/debug';
import { setClerkTokenProvider } from '@/utils/auth/clerk-token';
import { useAuthStore } from '@/utils/auth/store';
import { AuthModal } from '@/utils/auth/useAuthModal';
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ClerkAuthBridge({ children }) {
  const { auth, authSource, setAuth } = useAuthStore();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user } = useUser();
  const clerk = useClerk();

  useEffect(() => {
    authLog('info', 'bridge:token-provider:set', {
      isLoaded,
      isSignedIn,
      hasUser: Boolean(user?.id),
    });
    return setClerkTokenProvider(() =>
      getToken()
        .then((token) => {
          authLog('info', 'bridge:get-token:success', {
            hasToken: Boolean(token),
            isLoaded,
            isSignedIn,
            userId: user?.id,
          });
          return token;
        })
        .catch((error) => {
          authLog('warn', 'bridge:get-token:error', {
            error,
            isLoaded,
            isSignedIn,
            userId: user?.id,
          });
          return null;
        })
    );
  }, [getToken, isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    authLog('info', 'bridge:state', {
      isLoaded,
      isSignedIn,
      hasUser: Boolean(user?.id),
      userId: user?.id,
      authSource,
      hasAppAuth: Boolean(auth?.jwt),
    });

    if (!isLoaded) {
      return;
    }

    if (authSource === 'manual' && !auth && isSignedIn) {
      authLog('info', 'bridge:manual-signout-clerk-session');
      clerk
        .signOut()
        .then(() => {
          authLog('info', 'bridge:manual-signout:success');
        })
        .catch((error) => {
          authLog('warn', 'bridge:manual-signout:error', { error });
        })
        .finally(() => {
          const current = useAuthStore.getState();
          if (!current.auth && current.authSource === 'manual') {
            setAuth(null, { source: 'signed-out' });
          }
        });
      return;
    }

    if (authSource === 'manual' && !auth && !isSignedIn) {
      setAuth(null, { source: 'signed-out' });
      return;
    }

    if (!isSignedIn || !user?.id) {
      if (auth?.jwt && authSource === 'clerk') {
        setAuth(null, { source: 'clerk' });
      }
      return;
    }

    let isMounted = true;
    getToken()
      .then((jwt) => {
        if (!isMounted || !jwt) {
          return;
        }
        const primaryEmail = user.primaryEmailAddress?.emailAddress;
        const nextAuth = {
          jwt,
          user: {
            id: user.id,
            email: primaryEmail,
            name: user.fullName || user.username || primaryEmail || 'Runner',
          },
        };
        if (auth?.jwt !== nextAuth.jwt || auth?.user?.id !== nextAuth.user.id) {
          authLog('info', 'bridge:set-app-auth', {
            userId: user.id,
            email: primaryEmail,
            hadPreviousToken: Boolean(auth?.jwt),
            previousUserId: auth?.user?.id,
          });
          setAuth(nextAuth, { source: 'clerk' });
        }
      })
      .catch((error) => {
        authLog('warn', 'bridge:sync-token:error', {
          error,
          isLoaded,
          isSignedIn,
          userId: user?.id,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [auth, authSource, clerk, getToken, isLoaded, isSignedIn, setAuth, user]);

  return children;
}

export default function RootLayout() {
  const { initiate, isReady } = useAuth();

  useEffect(() => {
    initiate();
  }, [initiate]);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  if (!isReady) {
    return null;
  }

  const app = (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" />
        </Stack>
        <AuthModal />
      </GestureHandlerRootView>
    </QueryClientProvider>
  );

  if (clerkPublishableKey) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <ClerkAuthBridge>{app}</ClerkAuthBridge>
      </ClerkProvider>
    );
  }

  return app;
}
