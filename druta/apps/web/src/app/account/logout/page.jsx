import useAuth from "@/utils/useAuth";

function MainComponent() {
  const { signOut } = useAuth();
  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/", redirect: true });
  };
  return (
    <div
      className="flex min-h-screen w-full items-center justify-center p-4"
      style={{ backgroundColor: "#050505" }}
    >
      <div
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
          See you on the track.
        </p>
        <button
          onClick={handleSignOut}
          className="w-full rounded-2xl px-4 py-3.5 text-base font-bold"
          style={{
            backgroundColor: "#2D7AFF",
            color: "#000000",
            boxShadow: "0 0 24px rgba(45,122,255,0.3)",
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default MainComponent;
