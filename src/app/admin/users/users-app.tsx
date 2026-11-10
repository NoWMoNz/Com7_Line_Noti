'use client';

import { useCallback, useEffect, useState } from 'react';
import { canManageUser } from '@/lib/admin/roles';
import type { AdminRole } from '@/lib/admin/types';
import type { AdminUser } from '@/lib/admin/users-service';
import { Badge, Button, ErrorText, Icon, Spinner } from '@/components/ui';
import { adminFetch, fmtDateTime } from '../admin-lib';
import { useAdmin } from '../shell';

const ROLES: Array<{ role: AdminRole; desc: string }> = [
  { role: 'Admin', desc: 'ผู้สมัคร, แจ้งเริ่มงาน (แก้ไขได้ ส่งไม่ได้), สาขา, เอกสาร' },
  { role: 'Admin2', desc: 'ทุกหน้า ยกเว้นผู้ใช้และตั้งค่า, ส่งแจ้งเริ่มงานได้' },
  { role: 'SuperAdmin', desc: 'ภาพรวม, ผู้สมัคร, แจ้งเริ่มงาน (แก้หลังส่งได้), สาขา, ผู้ใช้, ตั้งค่า' },
  { role: 'Developer', desc: 'ทุกอย่าง' },
];

const INPUT =
  'h-10 w-full rounded-lg border border-line bg-background px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function UsersApp() {
  const me = useAdmin();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string } | null>(null);
  const [inviting, setInviting] = useState(false);

  const apply = useCallback((r: Awaited<ReturnType<typeof adminFetch<AdminUser[]>>>) => {
    if (r.ok) {
      setUsers(r.data);
      setError(null);
    } else setError(r.error);
  }, []);
  useEffect(() => {
    adminFetch<AdminUser[]>('users').then(apply);
  }, [apply]);
  const reload = () => adminFetch<AdminUser[]>('users').then(apply);
  const assignable = ROLES.filter((r) => canManageUser(me.role, r.role));

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">ผู้ใช้และสิทธิ์</h1>
            <p className="text-sm text-muted">เพิ่มผู้ใช้แล้วส่ง &quot;ลิงก์ตั้งรหัสผ่าน&quot; ให้เจ้าของบัญชีตั้งรหัสเอง — ไม่มีใครรู้รหัสของคนอื่น</p>
          </div>
          {!inviting && (
            <Button onClick={() => setInviting(true)} className="sm:w-auto">
              <Icon name="plus" className="size-4" /> เพิ่มผู้ใช้
            </Button>
          )}
        </div>

        {link && <LinkBox email={link.email} url={link.url} onClose={() => setLink(null)} />}
        {inviting && (
          <InviteForm
            roles={assignable}
            onCancel={() => setInviting(false)}
            onDone={(email, url) => {
              setInviting(false);
              setLink({ email, url });
              reload();
            }}
          />
        )}

        <ErrorText>{error}</ErrorText>
        {!users && !error && (
          <p className="flex items-center gap-2 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        )}

        {users && (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isMe={u.id === me.id}
                manageable={canManageUser(me.role, u.role)}
                roles={assignable}
                onChanged={reload}
                onLink={(url) => setLink({ email: u.email, url })}
              />
            ))}
          </ul>
        )}

        <section className="rounded-xl bg-surface p-4 text-sm">
          <h2 className="mb-2 font-semibold">สิทธิ์ของแต่ละ Role</h2>
          <dl className="grid gap-1.5 sm:grid-cols-[110px_1fr]">
            {ROLES.map((r) => (
              <div key={r.role} className="contents">
                <dt className="font-medium">{r.role}</dt>
                <dd className="text-muted">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}

function LinkBox({ email, url, onClose }: { email: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-brand/40 bg-brand-tint p-4">
      <p className="text-sm font-semibold text-brand-strong">ลิงก์ตั้งรหัสผ่านของ {email}</p>
      <p className="text-sm">ส่งลิงก์นี้ให้เจ้าของบัญชีทางช่องทางส่วนตัว — ใช้ได้ครั้งเดียว หมดอายุประมาณ 1 ชั่วโมง ห้ามโพสต์ในกลุ่ม</p>
      <div className="flex gap-2">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="ลิงก์ตั้งรหัสผ่าน" className={`${INPUT} font-mono text-xs`} />
        <button
          type="button"
          onClick={() =>
            navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
          className="shrink-0 rounded-lg bg-foreground px-4 text-sm font-semibold text-background"
        >
          {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
        </button>
      </div>
      <button type="button" onClick={onClose} className="text-sm text-muted underline underline-offset-2">
        ปิด
      </button>
    </div>
  );
}

function InviteForm({
  roles,
  onCancel,
  onDone,
}: {
  roles: Array<{ role: AdminRole }>;
  onCancel: () => void;
  onDone: (email: string, link: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<AdminRole>('Admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await adminFetch<{ user: AdminUser; link: string }>('users', { method: 'POST', body: { email, fullName, role } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    onDone(r.data.user.email, r.data.link);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line p-4">
      <h2 className="font-semibold">เพิ่มผู้ใช้</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">อีเมล</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">ชื่อที่แสดง</span>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={INPUT} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)} className={INPUT}>
            {roles.map((r) => (
              <option key={r.role} value={r.role}>
                {r.role}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !email} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
          {busy ? 'กำลังสร้าง...' : 'สร้างผู้ใช้และออกลิงก์'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-surface">
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user: u,
  isMe,
  manageable,
  roles,
  onChanged,
  onLink,
}: {
  user: AdminUser;
  isMe: boolean;
  manageable: boolean;
  roles: Array<{ role: AdminRole }>;
  onChanged: () => void;
  onLink: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(path: string, body: unknown, confirmText?: string): Promise<T | null> {
    if (confirmText && !window.confirm(confirmText)) return null;
    setBusy(true);
    const r = await adminFetch<T>(path, { method: 'POST', body });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return null;
    }
    setError(null);
    return r.data;
  }

  return (
    <li className={`flex flex-wrap items-center gap-3 p-4 ${u.active ? '' : 'opacity-60'}`}>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {u.fullName || u.email} {isMe && <span className="text-xs font-normal text-muted">(คุณ)</span>}
        </p>
        <p className="text-sm text-muted">{u.email}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {!u.active && <Badge tone="danger">ปิดใช้งาน</Badge>}
          {u.neverSignedIn ? (
            <Badge tone="warn">ยังไม่เคยเข้าสู่ระบบ</Badge>
          ) : (
            <span className="text-xs text-muted">เข้าล่าสุด {fmtDateTime(u.lastSignInAt)}</span>
          )}
        </div>
      </div>

      {manageable && !isMe ? (
        <select
          value={u.role}
          disabled={busy}
          aria-label={`Role ของ ${u.email}`}
          onChange={async (e) => (await call(`users/${u.id}`, { role: e.target.value })) && onChanged()}
          className={`${INPUT} w-36`}
        >
          {roles.map((r) => (
            <option key={r.role} value={r.role}>
              {r.role}
            </option>
          ))}
        </select>
      ) : (
        <Badge tone="muted">{u.role}</Badge>
      )}

      {manageable && (
        <div className="flex flex-wrap gap-1 text-sm">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const d = await call<{ link: string }>(`users/${u.id}/password-link`, {});
              if (d) onLink(d.link);
            }}
            className="rounded px-2 py-1 text-brand hover:bg-brand-tint disabled:opacity-50"
          >
            ลิงก์ตั้งรหัสผ่าน
          </button>
          {!isMe && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={async () =>
                  (await call(`users/${u.id}`, { active: !u.active }, u.active ? `ปิดใช้งาน ${u.email}? จะเข้าระบบไม่ได้จนกว่าจะเปิดอีกครั้ง` : undefined)) &&
                  onChanged()
                }
                className="rounded px-2 py-1 text-muted hover:bg-surface disabled:opacity-50"
              >
                {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => (await call(`users/${u.id}/delete`, {}, `ลบผู้ใช้ ${u.email} ถาวร?`)) && onChanged()}
                className="rounded px-2 py-1 text-danger hover:bg-danger-tint disabled:opacity-50"
              >
                ลบ
              </button>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="w-full">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </li>
  );
}
