import { createClerkClient } from '@clerk/backend';

const getClerkPublishableKey = () =>
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const hasClerkConfig = () => {
  return Boolean(process.env.CLERK_SECRET_KEY && getClerkPublishableKey());
};

export async function getClerkSession(request) {
  if (!hasClerkConfig()) {
    return null;
  }

  try {
    const clerkClient = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: getClerkPublishableKey(),
    });
    const requestState = await clerkClient.authenticateRequest(request);

    if (!requestState?.isSignedIn) {
      return null;
    }

    const auth = requestState.toAuth();
    const clerkUser = auth?.userId ? await clerkClient.users.getUser(auth.userId) : null;
    const primaryEmailAddress =
      clerkUser?.primaryEmailAddress ||
      clerkUser?.emailAddresses?.find((emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId) ||
      clerkUser?.emailAddresses?.[0];

    const user = auth?.userId
      ? {
          id: auth.userId,
          email: primaryEmailAddress?.emailAddress || auth.sessionClaims?.email,
          name:
            clerkUser?.fullName ||
            auth.sessionClaims?.full_name ||
            auth.sessionClaims?.name ||
            null,
          image: clerkUser?.imageUrl || auth.sessionClaims?.picture,
        }
      : null;

    if (!user?.id) return null;
    return {
      user,
      token: auth.getToken ? await auth.getToken() : null,
    };
  } catch {
    return null;
  }
}
