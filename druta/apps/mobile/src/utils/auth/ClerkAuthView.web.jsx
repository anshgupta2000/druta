import React from 'react';
import { SignIn, SignUp } from '@clerk/expo/web';
import { useAuth } from '@clerk/expo';
import { View } from 'react-native';

const appearance = {
  variables: {
    colorPrimary: '#2D7AFF',
    colorBackground: '#111113',
    colorInputBackground: '#1F1F23',
    colorText: '#F5F5F5',
    colorTextSecondary: '#A1A1AA',
    borderRadius: '16px',
  },
  elements: {
    cardBox: {
      boxShadow: 'none',
      border: '1px solid rgba(255,255,255,0.1)',
    },
  },
};

export function ClerkAuthView({ mode, close }) {
  const { isSignedIn } = useAuth();
  const appReturnUrl = React.useMemo(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const url = new URL(window.location.href);
    url.hash = '';
    url.searchParams.delete('auth');
    return url.toString();
  }, []);
  const signInUrl = React.useMemo(() => {
    if (!appReturnUrl) {
      return undefined;
    }
    const url = new URL(appReturnUrl);
    url.searchParams.set('auth', 'signin');
    return url.toString();
  }, [appReturnUrl]);
  const signUpUrl = React.useMemo(() => {
    if (!appReturnUrl) {
      return undefined;
    }
    const url = new URL(appReturnUrl);
    url.searchParams.set('auth', 'signup');
    return url.toString();
  }, [appReturnUrl]);

  React.useEffect(() => {
    if (isSignedIn) {
      close();
    }
  }, [close, isSignedIn]);

  const Component = mode === 'signup' ? SignUp : SignIn;
  const redirectProps =
    mode === 'signup'
      ? {
          forceRedirectUrl: appReturnUrl,
          fallbackRedirectUrl: appReturnUrl,
          signInUrl,
        }
      : {
          forceRedirectUrl: appReturnUrl,
          fallbackRedirectUrl: appReturnUrl,
          signUpUrl,
        };

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#050505',
        paddingHorizontal: 20,
      }}
    >
      <Component appearance={appearance} routing="hash" {...redirectProps} />
    </View>
  );
}
