import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "@/api/auth";
import {
  useAdminUsers,
  useAllPlates,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useAssignPlate,
  useRevokePlate,
  useResetUserPassword,
  type AdminUser,
} from "@/api/admin";
import { LoadingBlock, ErrorBlock } from "@/components/LoadingBlock";
import { useT } from "@/store/uiLang";

export function AdminPage() {
  const t = useT();
  const { data: me, isLoading: meLoading } = useMe();
  const users = useAdminUsers();
  const plates = useAllPlates();

  if (meLoading) return <LoadingBlock />;
  if (!me?.is_admin) return <Navigate to="/plates" replace />;

  return (
    <div className="flex-1 pl-16 pr-4 lg:px-8 py-8 mx-auto w-full max-w-[1200px]">
      <h1 className="text-ink-primary text-h2 font-bold mb-1">{t("관리자", "Admin")}</h1>
      <p className="text-ink-secondary text-body mb-6">
        {t("계정을 발급하고 계정별로 플레이트를 배정합니다.", "Provision accounts and assign plates per account.")}
      </p>

      <CreateUserCard />

      <div className="mt-8">
        <h2 className="text-ink-primary text-card font-semibold mb-3">{t("사용자", "Users")}</h2>
        {users.isLoading && <LoadingBlock />}
        {users.error && <ErrorBlock error={users.error} />}
        {users.data && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-body border-collapse">
              <thead>
                <tr className="text-meta text-ink-muted bg-surface-soft border-b border-line">
                  <th className="text-left px-4 py-2.5 font-medium">{t("이메일", "Email")}</th>
                  <th className="text-left px-4 py-2.5 font-medium">{t("역할", "Role")}</th>
                  <th className="text-left px-4 py-2.5 font-medium">{t("플레이트 배정", "Plate access")}</th>
                  <th className="text-right px-4 py-2.5 font-medium">{t("작업", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <UserRow
                    key={u.id}
                    u={u}
                    meId={me.id}
                    plateOptions={plates.data ?? []}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateUserCard() {
  const t = useT();
  const create = useCreateUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [issued, setIssued] = useState<{ email: string; pw: string } | null>(null);

  const conventionPw = (e: string) => `${e.split("@")[0].trim().toLowerCase()}123!@`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const em = email.trim();
    const initial = password || conventionPw(em);
    create.mutate(
      { email: em, password: password || undefined, display_name: name || undefined, is_admin: isAdmin },
      { onSuccess: () => { setIssued({ email: em, pw: initial }); setEmail(""); setPassword(""); setName(""); setIsAdmin(false); } },
    );
  }

  return (
    <form onSubmit={submit} className="rounded-lg border border-line bg-surface-card p-4">
      <div className="text-ink-primary font-semibold mb-3">{t("계정 발급", "Create account")}</div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("이메일", "Email")}>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-56 border border-line rounded-md px-2.5 py-1.5 text-body bg-surface-base text-ink-primary outline-none focus:border-brand-primary" />
        </Field>
        <Field label={t("비밀번호 (선택)", "Password (optional)")}>
          <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("비우면 자동", "auto if blank")}
            className="w-40 border border-line rounded-md px-2.5 py-1.5 text-body bg-surface-base text-ink-primary placeholder:text-ink-muted outline-none focus:border-brand-primary" />
        </Field>
        <Field label={t("이름", "Name")}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-40 border border-line rounded-md px-2.5 py-1.5 text-body bg-surface-base text-ink-primary outline-none focus:border-brand-primary" />
        </Field>
        <label className="flex items-center gap-1.5 text-body text-ink-secondary pb-1.5">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="accent-brand-primary" />
          {t("관리자", "Admin")}
        </label>
        <button type="submit" disabled={create.isPending} className="btn btn--primary px-4 py-1.5 disabled:opacity-50">
          {create.isPending ? t("발급 중…", "Creating…") : t("발급", "Create")}
        </button>
      </div>
      <div className="mt-2 text-meta text-ink-muted">
        {t("비밀번호를 비우면 초기비번은 ‘아이디+123!@’ 이며, 첫 로그인 시 변경해야 합니다.",
           "Leave password blank → initial password is ‘<id>123!@’; the user must change it on first login.")}
      </div>
      {create.isError && (
        <div className="mt-1 text-meta text-status-error">
          {create.error?.status === 409
            ? t("이미 존재하는 이메일입니다.", "Email already exists.")
            : t("발급에 실패했습니다.", "Failed to create account.")}
        </div>
      )}
      {issued && (
        <div className="mt-2 text-meta text-status-success">
          {t("발급됨", "Created")}: <span className="font-mono text-ink-primary">{issued.email}</span>
          {" · "}{t("초기비번", "Initial password")} <span className="font-mono text-ink-primary">{issued.pw}</span>
        </div>
      )}
    </form>
  );
}

function UserRow({ u, meId, plateOptions }: { u: AdminUser; meId: number; plateOptions: { plate_id: string }[] }) {
  const t = useT();
  const update = useUpdateUser();
  const del = useDeleteUser();
  const assign = useAssignPlate();
  const revoke = useRevokePlate();
  const resetPw = useResetUserPassword();
  const [tempPw, setTempPw] = useState<string | null>(null);
  const self = u.id === meId;
  const owned = new Set(u.plate_ids);

  return (
    <tr className={`border-b border-line/60 last:border-0 ${u.is_active ? "" : "opacity-50"}`}>
      <td className="px-4 py-2.5">
        <div className="text-ink-primary font-medium">{u.email}</div>
        {u.display_name && <div className="text-meta text-ink-muted">{u.display_name}</div>}
        {u.must_change_password && (
          <div className="text-caption text-status-warning mt-0.5">{t("비번 변경 대기", "must change pw")}</div>
        )}
        {tempPw && (
          <div className="text-meta text-status-success mt-1">
            {t("임시비번", "Temp password")}: <span className="font-mono text-ink-primary">{tempPw}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-1">
          {u.is_admin && <span className="chip text-meta">admin</span>}
          {u.is_demo && <span className="chip text-meta">demo</span>}
          {!u.is_active && <span className="chip text-meta text-status-error">{t("비활성", "inactive")}</span>}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {plateOptions.map((p) => (
            <label key={p.plate_id} className="flex items-center gap-1 text-meta text-ink-secondary">
              <input
                type="checkbox"
                className="accent-brand-primary"
                checked={owned.has(p.plate_id)}
                disabled={assign.isPending || revoke.isPending}
                onChange={(e) =>
                  e.target.checked
                    ? assign.mutate({ userId: u.id, plateId: p.plate_id })
                    : revoke.mutate({ userId: u.id, plateId: p.plate_id })
                }
              />
              {p.plate_id}
            </label>
          ))}
          {plateOptions.length === 0 && <span className="text-meta text-ink-muted">—</span>}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-2 text-meta">
          <button
            className="text-ink-secondary hover:text-brand-primary disabled:opacity-40"
            disabled={resetPw.isPending}
            title={t("비번을 ‘아이디+123!@’로 초기화하고 첫 로그인 시 변경 요구", "Reset to ‘<id>123!@’ and force change at next login")}
            onClick={() => resetPw.mutate(u.id, { onSuccess: (r) => setTempPw(r.password) })}
          >
            {t("비번 초기화", "Reset password")}
          </button>
          <span className="text-ink-muted opacity-40">·</span>
          <button
            className="text-ink-secondary hover:text-ink-primary disabled:opacity-40"
            disabled={self}
            title={t("관리자 토글", "Toggle admin")}
            onClick={() => update.mutate({ id: u.id, patch: { is_admin: !u.is_admin } })}
          >
            {u.is_admin ? t("관리자 해제", "Unset admin") : t("관리자 지정", "Make admin")}
          </button>
          <span className="text-ink-muted opacity-40">·</span>
          <button
            className="text-ink-secondary hover:text-ink-primary disabled:opacity-40"
            disabled={self}
            onClick={() => update.mutate({ id: u.id, patch: { is_active: !u.is_active } })}
          >
            {u.is_active ? t("비활성화", "Deactivate") : t("활성화", "Activate")}
          </button>
          <span className="text-ink-muted opacity-40">·</span>
          <button
            className="text-status-error hover:underline disabled:opacity-40"
            disabled={self}
            onClick={() => {
              if (confirm(t(`${u.email} 계정을 삭제할까요?`, `Delete account ${u.email}?`))) del.mutate(u.id);
            }}
          >
            {t("삭제", "Delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-meta text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
