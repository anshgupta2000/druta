import React from 'react';
import Constants from 'expo-constants';
import { Modal, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { AuthWebView } from './AuthWebView';
import { authKey, useAuthModal, useAuthStore } from './store';

const DEV_AUTH_PORT = process.env.EXPO_PUBLIC_AUTH_PORT || '3000';

const getHostFromCandidate = (candidate) => {
  if (!candidate || typeof candidate !== 'string') return null;
  const normalized = candidate
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .trim();
  return normalized.length > 0 ? normalized : null;
};

const getInferredLocalAuthBaseURL = () => {
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_AUTH_PORT}`;
  }

  if (Platform.OS === 'web') {
    return null;
  }

  const hostCandidates = [
    Constants?.expoConfig?.hostUri,
    Constants?.expoGoConfig?.debuggerHost,
    Constants?.manifest?.debuggerHost,
    Constants?.manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of hostCandidates) {
    const host = getHostFromCandidate(candidate);
    if (host) {
      return `http://${host}:${DEV_AUTH_PORT}`;
    }
  }

  return null;
};

/**
 * This component renders a modal for authentication purposes.
 * To show it programmatically, you should either use the `useRequireAuth` hook or the `useAuthModal` hook.
 *
 * @example
 * ```js
 * import { useAuthModal } from '@/utils/useAuthModal';
 * function MyComponent() {
 * const { open } = useAuthModal();
 * return <Button title="Login" onPress={() => open({ mode: 'signin' })} />;
 * }
 * ```
 *
 * @example
 * ```js
 * import { useRequireAuth } from '@/utils/useAuth';
 * function MyComponent() {
 *   // automatically opens the auth modal if the user is not authenticated
 *   useRequireAuth();
 *   return <Text>Protected Content</Text>;
 * }
 *
 */
export const AuthModal = () => {
  const { auth, setAuth } = useAuthStore();
  const { isOpen, mode, close } = useAuthModal();
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');

  const inferredLocalAuthBaseURL = React.useMemo(() => getInferredLocalAuthBaseURL(), []);
  const baseURL =
    process.env.EXPO_PUBLIC_AUTH_BASE_URL ||
    process.env.EXPO_PUBLIC_BASE_URL ||
    inferredLocalAuthBaseURL;
  const proxyURL =
    process.env.EXPO_PUBLIC_AUTH_PROXY_BASE_URL ||
    process.env.EXPO_PUBLIC_PROXY_BASE_URL ||
    baseURL;
  const canUseHostedAuth =
    process.env.EXPO_PUBLIC_FORCE_LOCAL_API !== 'true' && Boolean(baseURL && proxyURL);

  const completeLocalAuth = React.useCallback(() => {
    const normalizedEmail =
      email.trim() || `local-user-${Date.now()}@local.druta`;
    const displayName = name.trim() || normalizedEmail.split('@')[0];
    const userId = `local-${normalizedEmail
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')}`;
    const nextAuth = {
      jwt: `local-dev-token:${userId}`,
      user: {
        id: userId,
        email: normalizedEmail,
        name: displayName,
      },
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(authKey, JSON.stringify(nextAuth));
    }

    setAuth(nextAuth);
    close();
  }, [close, email, name, setAuth]);

  React.useEffect(() => {
    if (!isOpen) {
      setEmail('');
      setName('');
    }
  }, [isOpen]);

  if (!canUseHostedAuth) {
    return (
      <Modal visible={isOpen && !auth} animationType="slide" presentationStyle="pageSheet">
        <View
          style={{
            flex: 1,
            backgroundColor: '#0A0A0C',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ color: '#F5F5F5', fontSize: 32, fontWeight: '800' }}>
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </Text>
          <Text style={{ color: '#A1A1AA', marginTop: 8, fontSize: 14 }}>
            Continue with local development sign in.
          </Text>

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name (optional)"
            placeholderTextColor="#71717A"
            style={{
              marginTop: 24,
              borderWidth: 1,
              borderColor: '#27272A',
              borderRadius: 12,
              color: '#F5F5F5',
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 16,
              backgroundColor: '#111113',
            }}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email (optional)"
            placeholderTextColor="#71717A"
            keyboardType="email-address"
            autoCapitalize="none"
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: '#27272A',
              borderRadius: 12,
              color: '#F5F5F5',
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 16,
              backgroundColor: '#111113',
            }}
          />

          <TouchableOpacity
            onPress={completeLocalAuth}
            style={{
              marginTop: 20,
              backgroundColor: '#3B82F6',
              borderRadius: 12,
              alignItems: 'center',
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>
              Continue
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={close}
            style={{
              marginTop: 10,
              backgroundColor: '#1F1F23',
              borderRadius: 12,
              alignItems: 'center',
              paddingVertical: 14,
            }}
          >
            <Text style={{ color: '#D4D4D8', fontSize: 15, fontWeight: '600' }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={isOpen && !auth} animationType="slide" presentationStyle='pageSheet'>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100%',
          width: '100%',
          backgroundColor: '#fff',
          padding: 0,
        }}
      >
        <AuthWebView
          mode={mode}
          proxyURL={proxyURL}
          baseURL={baseURL}
        />
      </View>
    </Modal>
  );
};

export default useAuthModal;
