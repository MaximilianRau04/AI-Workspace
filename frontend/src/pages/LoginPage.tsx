import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api/auth";

interface Hint {
  text: string;
  cls: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [regUser, setRegUser] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regPass2, setRegPass2] = useState("");

  function pwHint(): Hint {
    if (!regPass) return { text: "", cls: "" };
    if (regPass.length < 6) return { text: "Too short", cls: "text-[#e8a33a]" };
    return { text: "✓ OK", cls: "text-[#4caf50]" };
  }

  function pw2Hint(): Hint {
    if (!regPass2) return { text: "", cls: "" };
    if (regPass2 !== regPass)
      return { text: "Passwords do not match", cls: "text-[#e87a7a]" };
    return { text: "✓ Match", cls: "text-[#4caf50]" };
  }

  async function handleLogin(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { ok, data } = await login(loginUser, loginPass);
    if (ok) {
      window.location.href = "/";
    } else {
      setError(data.detail || "Error logging in");
      setLoading(false);
    }
  }

  async function handleRegister(
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setError("");
    if (regPass !== regPass2) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const { ok, data } = await register(regUser, regPass);
    if (ok) {
      window.location.href = "/";
    } else {
      setError(data.detail || "Error registering");
      setLoading(false);
    }
  }

  const inputCls =
    "w-full bg-bg-muted border border-border rounded-[0.65rem] text-txt-primary text-[0.95rem] px-[0.85rem] py-[0.65rem] outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10 transition-all";
  const labelCls = "text-[0.78rem] font-medium text-txt-dim mb-[0.25rem] block";
  const { text: pwText, cls: pwCls } = pwHint();
  const { text: pw2Text, cls: pw2Cls } = pw2Hint();

  return (
    <div className="min-h-dvh flex items-center justify-center relative overflow-hidden bg-bg-base">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(47,109,245,0.09) 0%, transparent 65%)",
        }}
      />

      <div className="relative bg-bg-surface border border-border rounded-[1.5rem] p-8 w-full max-w-[380px] flex flex-col gap-[1.4rem] shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        {/* Top gradient accent line */}
        <div
          className="absolute top-0 left-[20%] right-[20%] h-[1px] rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(47,109,245,0.5), rgba(91,74,248,0.5), transparent)",
          }}
        />

        {/* Brand */}
        <div
          className="text-[1.35rem] font-bold text-center tracking-[-0.02em]"
          style={{
            background:
              "linear-gradient(135deg, var(--txt-heading) 20%, var(--txt-muted) 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          AI Workspace
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded-[0.75rem] overflow-hidden p-[3px] bg-bg-muted gap-[3px]">
          <button
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={`flex-1 py-[0.5rem] text-[0.875rem] font-medium text-center cursor-pointer border-none transition-all rounded-[0.55rem] ${
              tab === "login"
                ? "bg-bg-surface text-txt-primary shadow-sm"
                : "bg-transparent text-txt-dim hover:text-txt-muted"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setTab("register");
              setError("");
            }}
            className={`flex-1 py-[0.5rem] text-[0.875rem] font-medium text-center cursor-pointer border-none transition-all rounded-[0.55rem] ${
              tab === "register"
                ? "bg-bg-surface text-txt-primary shadow-sm"
                : "bg-transparent text-txt-dim hover:text-txt-muted"
            }`}
          >
            Register
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[0.85rem] text-[#e88] bg-[#2a1010] border border-[#5a1f1f] rounded-[0.65rem] px-3 py-[0.55rem]">
            {error}
          </div>
        )}

        {/* Login form */}
        {tab === "login" && (
          <form
            onSubmit={(e) => {
              void handleLogin(e);
            }}
            className="flex flex-col gap-[0.9rem]"
          >
            <div>
              <label className={labelCls}>Username</label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="your username"
                autoComplete="username"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-br from-accent to-[#5b4af8] hover:from-[#1a5de0] hover:to-[#4a3ae0] disabled:opacity-50 disabled:cursor-not-allowed border-none rounded-[0.8rem] text-white text-[0.95rem] font-semibold py-[0.75rem] cursor-pointer transition-all mt-1 shadow-[0_4px_16px_rgba(47,109,245,0.25)]"
            >
              {loading ? "Logging in…" : "Login"}
            </button>
          </form>
        )}

        {/* Register form */}
        {tab === "register" && (
          <form
            onSubmit={(e) => {
              void handleRegister(e);
            }}
            className="flex flex-col gap-[0.9rem]"
          >
            <div>
              <label className={labelCls}>Username</label>
              <input
                type="text"
                value={regUser}
                onChange={(e) => setRegUser(e.target.value)}
                placeholder="at least 3 characters"
                autoComplete="username"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Password</label>
              <input
                type="password"
                value={regPass}
                onChange={(e) => setRegPass(e.target.value)}
                placeholder="at least 6 characters"
                autoComplete="new-password"
                required
                className={inputCls}
              />
              {regPass && (
                <div className={`text-[0.76rem] mt-[0.3rem] min-h-4 ${pwCls}`}>
                  {pwText}
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Confirm password</label>
              <input
                type="password"
                value={regPass2}
                onChange={(e) => setRegPass2(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                required
                className={inputCls}
              />
              {regPass2 && (
                <div className={`text-[0.76rem] mt-[0.3rem] min-h-4 ${pw2Cls}`}>
                  {pw2Text}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-br from-accent to-[#5b4af8] hover:from-[#1a5de0] hover:to-[#4a3ae0] disabled:opacity-50 disabled:cursor-not-allowed border-none rounded-[0.8rem] text-white text-[0.95rem] font-semibold py-[0.75rem] cursor-pointer transition-all mt-1 shadow-[0_4px_16px_rgba(47,109,245,0.25)]"
            >
              {loading ? "Registering…" : "Register"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
