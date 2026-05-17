type ClerkTokenProvider = () => Promise<string | null>;

let clerkTokenProvider: ClerkTokenProvider | null = null;

export const setClerkTokenProvider = (provider: ClerkTokenProvider | null) => {
  clerkTokenProvider = provider;

  return () => {
    if (clerkTokenProvider === provider) {
      clerkTokenProvider = null;
    }
  };
};

export const getFreshClerkToken = async () => {
  if (!clerkTokenProvider) {
    return null;
  }

  try {
    return await clerkTokenProvider();
  } catch {
    return null;
  }
};
