import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/react-router";

export default function AuthCheckPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [profileState, setProfileState] = useState({
    loading: true,
    status: null,
    body: null,
    error: null,
  });
  const [tokenState, setTokenState] = useState({
    loading: true,
    hasToken: false,
    error: null,
  });

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setProfileState({
        loading: false,
        status: null,
        body: null,
        error: "Not signed in",
      });
      setTokenState({
        loading: false,
        hasToken: false,
        error: "Not signed in",
      });
      return;
    }

    let isMounted = true;

    getToken()
      .then((token) => {
        if (!isMounted) return;
        setTokenState({ loading: false, hasToken: Boolean(token), error: null });
      })
      .catch((error) => {
        if (!isMounted) return;
        setTokenState({
          loading: false,
          hasToken: false,
          error: error?.message || "Failed to read Clerk token",
        });
      });

    fetch("/api/profile")
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!isMounted) return;
        setProfileState({
          loading: false,
          status: response.status,
          body,
          error: response.ok ? null : body?.error || "Profile request failed",
        });
      })
      .catch((error) => {
        if (!isMounted) return;
        setProfileState({
          loading: false,
          status: null,
          body: null,
          error: error?.message || "Profile request failed",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  const profile = profileState.body?.user;

  return (
    <main
      className="flex min-h-screen w-full items-center justify-center p-6 text-white"
      style={{ backgroundColor: "#050505" }}
    >
      <section
        className="w-full max-w-xl rounded-3xl p-8"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">Druta auth check</h1>
          <p className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.54)" }}>
            This page verifies the Clerk browser session and the Druta profile API.
          </p>
        </div>

        <div className="space-y-4 text-sm">
          <div className="rounded-2xl bg-white/[0.06] p-4">
            <div className="font-semibold">Clerk session</div>
            <div className="mt-2" style={{ color: "rgba(255,255,255,0.72)" }}>
              {!isLoaded
                ? "Loading..."
                : isSignedIn
                  ? `Signed in as ${user?.primaryEmailAddress?.emailAddress || user?.id}`
                  : "Not signed in"}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.06] p-4">
            <div className="font-semibold">Clerk token</div>
            <div className="mt-2" style={{ color: "rgba(255,255,255,0.72)" }}>
              {tokenState.loading
                ? "Loading..."
                : tokenState.hasToken
                  ? "Available"
                  : tokenState.error || "Missing"}
            </div>
          </div>

          <div className="rounded-2xl bg-white/[0.06] p-4">
            <div className="font-semibold">Druta profile API</div>
            <div className="mt-2" style={{ color: "rgba(255,255,255,0.72)" }}>
              {profileState.loading
                ? "Loading..."
                : profileState.status
                  ? `HTTP ${profileState.status}`
                  : profileState.error || "No response"}
            </div>
            {profile ? (
              <pre className="mt-3 overflow-auto rounded-xl bg-black/40 p-3 text-xs text-white/80">
                {JSON.stringify(
                  {
                    id: profile.id,
                    email: profile.email,
                    username: profile.username,
                    name: profile.name,
                  },
                  null,
                  2,
                )}
              </pre>
            ) : null}
            {profileState.error ? (
              <div className="mt-3 text-xs" style={{ color: "#FF6B7A" }}>
                {profileState.error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <a
            className="rounded-2xl px-4 py-3 text-sm font-bold"
            style={{ backgroundColor: "#2D7AFF", color: "#020617" }}
            href="/account/signin?callbackUrl=/account/auth-check"
          >
            Sign in again
          </a>
          <a
            className="rounded-2xl bg-white/[0.08] px-4 py-3 text-sm font-semibold text-white"
            href="/account/logout"
          >
            Sign out
          </a>
        </div>
      </section>
    </main>
  );
}
