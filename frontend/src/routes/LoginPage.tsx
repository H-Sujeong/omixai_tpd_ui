import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLogin } from "@/api/auth";
import { useT } from "@/store/uiLang";
import { LangToggle } from "@/components/LangToggle";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const from = location.state?.from ?? "/plates";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      { onSuccess: () => navigate(from, { replace: true }) },
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base p-6">
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <LangToggle />
        <ThemeToggle />
      </div>

      <div className="w-full max-w-[380px]">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-md bg-brand-primary/15 border border-brand-primary/40 flex items-center justify-center text-brand-primary font-bold text-meta">
            TPD
          </div>
          <span className="text-ink-primary font-semibold text-card">OmixAI-TPD</span>
        </div>

        <h1 className="text-ink-primary text-h2 font-bold mb-1">{t("로그인", "Sign in")}</h1>
        <p className="text-ink-secondary text-body mb-6">
          {t("계정으로 로그인하여 실험 데이터에 접근합니다.", "Sign in to access your experiment data.")}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-meta text-ink-muted">{t("이메일", "Email")}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary focus:border-brand-primary outline-none"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-meta text-ink-muted">{t("비밀번호", "Password")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="border border-line rounded-md px-3 py-2 text-body bg-surface-card text-ink-primary focus:border-brand-primary outline-none"
            />
          </label>

          {login.isError && (
            <div className="text-meta text-status-error">
              {t("이메일 또는 비밀번호가 올바르지 않습니다.", "Invalid email or password.")}
            </div>
          )}

          <button
            type="submit"
            disabled={login.isPending}
            className="btn btn--primary mt-1 py-2 disabled:opacity-50"
          >
            {login.isPending ? t("로그인 중…", "Signing in…") : t("로그인", "Sign in")}
          </button>
        </form>

        <div className="mt-5 rounded-md border border-line bg-surface-soft px-3 py-2.5 text-meta text-ink-secondary">
          <span className="text-ink-muted">{t("데모 계정", "Demo account")}: </span>
          <button
            type="button"
            className="text-brand-primary hover:underline"
            onClick={() => { setEmail("demo@omixai.local"); setPassword("omixai@demo123"); }}
          >
            demo@omixai.local / omixai@demo123
          </button>
        </div>
      </div>
    </div>
  );
}
