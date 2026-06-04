import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useResetPassword } from "@/api/auth";
import { useT } from "@/store/uiLang";
import { useTheme } from "@/hooks/useTheme";
import { LangToggle } from "@/components/LangToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { auroraBackground } from "@/routes/LoginPage";

export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const mismatch = pw2.length > 0 && pw !== pw2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || pw.length < 4) return;
    reset.mutate({ token, password: pw });
  }

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

      <div
        className="relative z-10 w-full max-w-[420px] rounded-3xl px-8 py-10 shadow-2xl"
        style={{ background: glass.bg, border: `1px solid ${glass.border}`, backdropFilter: "blur(22px)", WebkitBackdropFilter: "blur(22px)" }}
      >
        <h1 className="text-ink-primary text-h2 font-bold tracking-tight text-center mb-6">
          {t("비밀번호 재설정", "Reset password")}
        </h1>

        {!token ? (
          <div className="text-center text-body text-ink-secondary">
            {t("유효하지 않은 링크입니다.", "Invalid reset link.")}
            <div className="mt-4"><Link to="/login" className="text-brand-primary hover:underline">{t("로그인으로", "Back to sign in")}</Link></div>
          </div>
        ) : reset.isSuccess ? (
          <div className="text-center text-body text-ink-secondary">
            {t("비밀번호가 변경되었습니다.", "Your password has been changed.")}
            <div className="mt-4">
              <button
                className="px-4 py-2 rounded-full font-semibold text-white"
                style={{ background: "linear-gradient(135deg, rgb(var(--color-brand-primary-rgb)), rgb(139 92 246))" }}
                onClick={() => navigate("/login", { replace: true })}
              >
                {t("로그인", "Sign in")}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("새 비밀번호", "New password")}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              className="w-full border px-4 py-3 rounded-full text-body text-ink-primary placeholder:text-ink-muted outline-none focus:border-brand-primary"
              style={fieldStyle}
            />
            <input
              type="password"
              autoComplete="new-password"
              placeholder={t("새 비밀번호 확인", "Confirm new password")}
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              required
              className="w-full border px-4 py-3 rounded-full text-body text-ink-primary placeholder:text-ink-muted outline-none focus:border-brand-primary"
              style={fieldStyle}
            />
            {mismatch && (
              <div className="text-meta text-status-error text-center">{t("비밀번호가 일치하지 않습니다.", "Passwords don't match.")}</div>
            )}
            {reset.isError && (
              <div className="text-meta text-status-error text-center">
                {t("링크가 만료되었거나 유효하지 않습니다.", "The link is invalid or has expired.")}
              </div>
            )}
            <button
              type="submit"
              disabled={reset.isPending || mismatch || pw.length < 4}
              className="mt-1 py-3 rounded-full font-semibold text-white shadow-lg disabled:opacity-50 transition-transform hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg, rgb(var(--color-brand-primary-rgb)), rgb(139 92 246))" }}
            >
              {reset.isPending ? t("변경 중…", "Updating…") : t("비밀번호 변경", "Update password")}
            </button>
            <Link to="/login" className="mt-2 text-center text-meta text-ink-muted hover:text-brand-primary">
              ← {t("로그인으로 돌아가기", "Back to sign in")}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
