import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChangePassword, useMe } from "@/api/auth";
import { useT } from "@/store/uiLang";

/**
 * Forced first-login password change. RequireAuth routes a user here whenever
 * must_change_password is set; on success the flag clears and we send the new
 * user straight to the guide (their first stop) rather than the plate list.
 */
export function SetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const change = useChangePassword();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const mismatch = pw2.length > 0 && pw !== pw2;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || pw.length < 6) return;
    change.mutate(pw, { onSuccess: () => navigate("/guide", { replace: true }) });
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface-card p-8 shadow-lg">
        <h1 className="text-ink-primary text-h2 font-bold mb-1">{t("새 비밀번호 설정", "Set a new password")}</h1>
        <p className="text-ink-secondary text-body mb-6">
          {t(
            `${me?.email ?? ""} — 첫 로그인입니다. 계속하려면 비밀번호를 변경하세요.`,
            `${me?.email ?? ""} — first sign-in. Please set a new password to continue.`,
          )}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("새 비밀번호 (6자 이상)", "New password (6+ chars)")}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            className="border border-line rounded-md px-3 py-2 text-body bg-surface-base text-ink-primary outline-none focus:border-brand-primary"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("새 비밀번호 확인", "Confirm new password")}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            className="border border-line rounded-md px-3 py-2 text-body bg-surface-base text-ink-primary outline-none focus:border-brand-primary"
          />
          {mismatch && (
            <div className="text-meta text-status-error">{t("비밀번호가 일치하지 않습니다.", "Passwords don't match.")}</div>
          )}
          {change.isError && (
            <div className="text-meta text-status-error">{t("변경에 실패했습니다. 다시 시도하세요.", "Failed to update. Try again.")}</div>
          )}
          <button
            type="submit"
            disabled={change.isPending || mismatch || pw.length < 6}
            className="btn btn--primary mt-1 py-2 disabled:opacity-50"
          >
            {change.isPending ? t("변경 중…", "Updating…") : t("비밀번호 변경 후 계속", "Change & continue")}
          </button>
        </form>
      </div>
    </div>
  );
}
