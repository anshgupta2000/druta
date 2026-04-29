import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

export const authKey = `${process.env.EXPO_PUBLIC_PROJECT_GROUP_ID}-jwt`;

export const readStoredAuth = async () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    const localValue = window.localStorage.getItem(authKey);
    if (localValue) return localValue;
  }

  try {
    const secureValue = await SecureStore.getItemAsync(authKey);
    if (secureValue) return secureValue;
  } catch {}

  return null;
};

export const writeStoredAuth = async (auth) => {
  const value = JSON.stringify(auth);
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(authKey, value);
  }

  try {
    await SecureStore.setItemAsync(authKey, value);
  } catch {}
};

export const clearStoredAuth = async () => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(authKey);
  }

  try {
    await SecureStore.deleteItemAsync(authKey);
  } catch {}
};

/**
 * This store manages the authentication state of the application.
 */
export const useAuthStore = create((set) => ({
  isReady: false,
  auth: null,
  setAuth: (auth) => {
    if (auth) {
      writeStoredAuth(auth);
    } else {
      clearStoredAuth();
    }
    set({ auth });
  },
}));

/**
 * This store manages the state of the authentication modal.
 */
export const useAuthModal = create((set) => ({
  isOpen: false,
  mode: 'signup',
  open: (options) => set({ isOpen: true, mode: options?.mode || 'signup' }),
  close: () => set({ isOpen: false }),
}));
