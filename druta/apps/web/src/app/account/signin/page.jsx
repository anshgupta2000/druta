import { useState, useEffect } from "react";
import useAuth from "@/utils/useAuth";

function MainComponent() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { signInWithCredentials } = useAuth();

  // Check for error in URL params (set by auth redirect on failure)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get("error");
    if (urlError) {
      const errorMessages = {
        OAuthSignin: "Couldn't start sign-in. Please try again.",
        OAuthCallback: "Sign-in failed. Please try again.",
        OAuthCreateAccount: "Couldn't create an account. Try another option.",
        EmailCreateAccount: "This email can't be used. It may already exist.",
        Callback: "Something went wrong. Please try again.",
        OAuthAccountNotLinked: "This account uses a different sign-in method.",
        CredentialsSignin: "Incorrect email or password. Try again.",
        AccessDenied: "You don't have permission to sign in.",
        Configuration: "Sign-in isn't working right now. Try again later.",
        Verification: "Your sign-in link has expired. Request a new one.",
      };
      setError(
        errorMessages[urlError] || "Incorrect email or password. Try again.",
      );
    }
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!email || !password) {
      setError("Please fill in all fields");
      setLoading(false);
      return;
    }
    try {
      await signInWithCredentials({
        email,
        password,
        callbackUrl: "/",
        redirect: true,
      });
    } catch (err) {
      setError("Incorrect email or password. Try again.");
      setLoading(false);
    }
  };

  const getSearchString = () => {
    if (typeof window === "undefined") return "";
    // Preserve callbackUrl when switching between sign-in/sign-up
    const params = new URLSearchParams(window.location.search);
    const cb = params.get("callbackUrl");
    if (cb) return `?callbackUrl=${encodeURIComponent(cb)}`;
    return "";
  };

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4"
      style={{ backgroundColor: "#050505" }}
    >
      <form
        noValidate
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-3xl p-8"
        style={{
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="flex items-center justify-center mb-2">
          <span className="text-3xl font-extrabold tracking-tight text-white">
            druta
          </span>
          <span
            className="text-3xl font-extrabold"
            style={{ color: "#2D7AFF" }}
          >
            .
          </span>
        </div>
        <p
          className="text-center text-sm mb-8"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          Welcome back, runner.
        </p>
        <div className="space-y-4">
          <div>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full rounded-2xl px-4 py-3.5 text-white text-base outline-none transition-colors"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(45,122,255,0.4)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.08)")
              }
            />
          </div>
          <div>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full rounded-2xl px-4 py-3.5 text-white text-base outline-none transition-colors"
              style={{
                backgroundColor: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
              onFocus={(e) =>
                (e.target.style.borderColor = "rgba(45,122,255,0.4)")
              }
              onBlur={(e) =>
                (e.target.style.borderColor = "rgba(255,255,255,0.08)")
              }
            />
          </div>
          {error && (
            <div
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: "rgba(255,59,92,0.1)",
                color: "#FF3B5C",
                border: "1px solid rgba(255,59,92,0.15)",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl px-4 py-3.5 text-base font-bold transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: "#2D7AFF",
              color: "#000000",
              boxShadow: "0 0 24px rgba(45,122,255,0.3)",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <p
            className="text-center text-sm"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            Don't have an account?{" "}
            <a
              href={`/account/signup${getSearchString()}`}
              style={{ color: "#2D7AFF" }}
            >
              Sign up
            </a>
          </p>
        </div>
      </form>
    </div>
  );
}

export default MainComponent;
