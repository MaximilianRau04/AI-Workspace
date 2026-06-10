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
    "w-full bg-bg-base border border-border rounded-[0.6rem] text-txt-primary text-[0.95rem] px-[0.85rem] py-[0.65rem] outline-none focus:border-accent transition-colors";
  const labelCls = "text-[0.8rem] text-[#888] mb-[0.2rem] block";
  const { text: pwText, cls: pwCls } = pwHint();
  const { text: pw2Text, cls: pw2Cls } = pw2Hint();

  return (
    <div className="min-h-dvh flex items-center justify-center bg-bg-base">
      <div className="bg-bg-surface border border-border rounded-[1.2rem] p-8 w-full max-w-[380px] flex flex-col gap-[1.4rem]">
        <div className="text-[1.3rem] font-bold text-center text-white">
          AI Workspace
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded-[0.6rem] overflow-hidden">
          <button
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={`flex-1 py-[0.55rem] text-[0.9rem] font-medium text-center cursor-pointer border-none transition-all ${
              tab === "login"
                ? "bg-accent text-white"
                : "bg-transparent text-txt-dim"
            }`}
          >
            Login
          </button>
          <button
            onClick={() => {
              setTab("register");
              setError("");
            }}
            className={`flex-1 py-[0.55rem] text-[0.9rem] font-medium text-center cursor-pointer border-none transition-all ${
              tab === "register"
                ? "bg-accent text-white"
                : "bg-transparent text-txt-dim"
            }`}
          >
            Register
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="text-[0.85rem] text-[#e88] bg-[#2a1010] border border-[#5a1f1f] rounded-lg px-3 py-[0.55rem]">
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
              <label className={labelCls}>username</label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="username"
                autoComplete="username"
                required
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>password</label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="password"
                autoComplete="current-password"
                required
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-accent hover:bg-accent-hover disabled:bg-accent-dim disabled:cursor-not-allowed border-none rounded-[0.7rem] text-white text-[0.95rem] font-semibold py-[0.7rem] cursor-pointer transition-colors mt-1"
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
              <label className={labelCls}>username</label>
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
              <label className={labelCls}>password</label>
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
                placeholder="Confirm password"
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
              className="bg-accent hover:bg-accent-hover disabled:bg-accent-dim disabled:cursor-not-allowed border-none rounded-[0.7rem] text-white text-[0.95rem] font-semibold py-[0.7rem] cursor-pointer transition-colors mt-1"
            >
              {loading ? "Registering…" : "Register"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
