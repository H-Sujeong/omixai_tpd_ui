import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLogin } from "@/api/auth";
import { useT } from "@/store/uiLang";
import { useTheme } from "@/hooks/useTheme";
import { LangToggle } from "@/components/LangToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" strokeLinecap="round" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
  </svg>
);

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const location = useLocation() as { state?: { from?: string } };
  const login = useLogin();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  // Post-login default = /guide so first-time / demo users land on the
  // walkthrough rather than the raw plate list. Deep-link intent is still
  // honored via location.state.from (e.g. expired session on /plates/D3 → back
  // there after re-auth).
  const from = location.state?.from ?? "/guide";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(from, { replace: true }) },
    );
  }


  // Glass tones differ by mode so the frosted card reads on both backgrounds.
  const glass = isDark
    ? { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", field: "rgba(255,255,255,0.07)", fieldBorder: "rgba(255,255,255,0.12)" }
    : { bg: "rgba(255,255,255,0.55)", border: "rgba(255,255,255,0.7)", field: "rgba(255,255,255,0.65)", fieldBorder: "rgba(120,90,200,0.18)" };
  const fieldStyle: React.CSSProperties = { background: glass.field, borderColor: glass.fieldBorder };

  return (
    <div
      className="relative min-h-screen overflow-hidden flex items-center justify-center p-6"
      style={{ background: auroraBackground(isDark) }}
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
        <LangToggle />
        <ThemeToggle />
      </div>

      {/* Frosted glass card */}
      <div
        className="relative z-10 w-full max-w-[420px] rounded-3xl px-8 py-10 shadow-2xl"
        style={{ background: glass.bg, border: `1px solid ${glass.border}`, backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)" }}
      >
        <div className="flex flex-col items-center mb-7">
          <div className="w-11 h-11 rounded-xl bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-brand-primary font-bold mb-3">
            TPD
          </div>
          <h1 className="text-ink-primary text-h2 font-bold tracking-tight">
            {mode === "login" ? t("로그인", "Sign in") : t("비밀번호 재설정", "Reset password")}
          </h1>
        </div>

        {mode === "login" ? (
          <>
            <form onSubmit={submit} className="flex flex-col gap-3.5">
              <Field icon={<UserIcon />}>
                <input
                  type="email"
                  autoComplete="username"
                  placeholder={t("이메일", "Email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border pl-11 pr-4 py-3 rounded-full text-body text-ink-primary placeholder:text-ink-muted outline-none focus:border-brand-primary"
                  style={fieldStyle}
                />
              </Field>
              <Field icon={<LockIcon />}>
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t("비밀번호", "Password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border pl-11 pr-4 py-3 rounded-full text-body text-ink-primary placeholder:text-ink-muted outline-none focus:border-brand-primary"
                  style={fieldStyle}
                />
              </Field>

              <div className="flex items-center justify-between px-1 text-meta">
                <label className="flex items-center gap-1.5 text-ink-secondary cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-brand-primary" />
                  {t("로그인 유지", "Remember Me")}
                </label>
                <button type="button" className="text-ink-secondary hover:text-brand-primary transition-colors" onClick={() => setMode("forgot")}>
                  {t("비밀번호를 잊으셨나요?", "Forgot Password?")}
                </button>
              </div>

              {login.isError && (
                <div className="text-meta text-status-error text-center">
                  {t("이메일 또는 비밀번호가 올바르지 않습니다.", "Invalid email or password.")}
                </div>
              )}

              <button
                type="submit"
                disabled={login.isPending}
                className="mt-1 py-3 rounded-full font-semibold text-white shadow-lg disabled:opacity-50 transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, rgb(var(--color-brand-primary-rgb)), rgb(139 92 246))" }}
              >
                {login.isPending ? t("로그인 중…", "Signing in…") : t("로그인", "Sign in")}
              </button>
            </form>

            <button
              type="button"
              className="mt-5 w-full text-center text-meta text-ink-muted hover:text-brand-primary transition-colors"
              onClick={() => { setEmail("demo@omixai.local"); setPassword("omixai@demo123"); }}
            >
              {t("데모로 채우기", "Fill demo")} · demo@omixai.local
            </button>
          </>
        ) : (
          <>
            <div className="text-center text-body text-ink-secondary py-2" style={{ lineHeight: 1.7 }}>
              {t(
                "비밀번호 분실 시 관리자가 초기화합니다. 관리자에게 문의하면 임시 비밀번호(아이디+123!@)로 재설정해 드리며, 다음 로그인에서 새 비밀번호를 정하게 됩니다.",
                "If you forgot your password, an admin resets it. Ask your admin — they'll set a temporary password (<id>123!@) and you'll choose a new one at next sign-in.",
              )}
            </div>
            <button
              type="button"
              className="mt-5 w-full text-center text-meta text-ink-muted hover:text-brand-primary transition-colors"
              onClick={() => setMode("login")}
            >
              ← {t("로그인으로 돌아가기", "Back to sign in")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Layered purple/indigo aurora painted straight onto the page background, so
 *  it always shows (no reliance on faint blurred blobs). Tones soften in light. */
export function auroraBackground(isDark: boolean): string {
  // Big, overlapping blooms + a wide centre glow so the whole frame is washed in
  // colour (like the reference), not just the corners.
  const a = isDark ? [0.7, 0.62, 0.58, 0.42] : [0.46, 0.4, 0.36, 0.24];
  return [
    `radial-gradient(75rem 62rem at 18% 12%, rgb(var(--color-brand-primary-rgb) / ${a[0]}), transparent 72%)`,
    `radial-gradient(72rem 60rem at 88% 32%, rgba(99,102,241,${a[1]}), transparent 72%)`,
    `radial-gradient(80rem 66rem at 38% 118%, rgba(139,92,246,${a[2]}), transparent 72%)`,
    `radial-gradient(130rem 100rem at 55% 45%, rgba(124,58,237,${a[3]}), transparent 78%)`,
    `var(--color-surface-base)`,
  ].join(", ");
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">{icon}</span>
      {children}
    </div>
  );
}
