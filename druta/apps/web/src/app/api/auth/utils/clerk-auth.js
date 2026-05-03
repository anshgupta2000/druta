import { authenticateRequest } from '@clerk/backend';

const hasClerkConfig = () => {
  return Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);
};

export async function getClerkSession(request) {
  if (!hasClerkConfig()) {
    return null;
  }

  try {
    const requestState = await authenticateRequest(request, {
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    });

    if (!requestState?.isSignedIn) {
      return null;
    }

    const user = requestState.toAuth()?.userId
      ? {
          id: requestState.toAuth().userId,
          email: requestState.toAuth().sessionClaims?.email,
          name:
            requestState.toAuth().sessionClaims?.full_name ||
            requestState.toAuth().sessionClaims?.name ||
            null,
          image: requestState.toAuth().sessionClaims?.picture,
        }
      : null;

    if (!user?.id) return null;
    return {
      user,
      token: requestState.toAuth().getToken?.() || null,
    };
  } catch {
    return null;
  }
}
