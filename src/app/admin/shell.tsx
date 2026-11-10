'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useState } from 'react';
import { canAccess, type AdminSection } from '@/lib/admin/roles';
import type { AdminProfile } from '@/lib/admin/types';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { Icon, Spinner } from '@/components/ui';
import { adminFetch } from './admin-lib';

const AdminContext = createContext<AdminProfile | null>(null);

/** แอดมินที่ login อยู่ — ใช้ได้เฉพาะใน <AdminShell> */
export function useAdmin(): AdminProfile {
  const me = useContext(AdminContext);
  if (!me) throw new Error('useAdmin ต้องอยู่ใน AdminShell');
  return me;
}

const NAV: Array<{ section: AdminSection; href: string; label: string }> = [
  { section: 'applicants', href: '/admin', label: 'ผู้สมัคร' },
  { section: 'onboarding', href: '/admin/onboarding', label: 'แจ้งเริ่มงาน' },
  { section: 'branches', href: '/admin/branches', label: 'สาขา' },
];

/**
 * โครงหน้าแอดมิน: ตรวจ login → เมนูตามสิทธิ์ → เนื้อหา
 * เนื้อหา (children) render หลังรู้ตัวแอดมินแล้วเท่านั้น จึงอ่าน window ได้ตั้งแต่ render แรก
 */
export function AdminShell({ section, children }: { section: AdminSection; children: React.ReactNode }) {
  const [me, setMe] = useState<AdminProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<AdminProfile>('me').then((r) => (r.ok ? setMe(r.data) : setError(r.error)));
  }, []);

  async function logout() {
    await getSupabaseBrowser().auth.signOut();
    window.location.replace('/admin/login');
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-1 border-b border-line px-3 py-2 sm:gap-3 sm:px-4">
        <p className="mr-2 hidden font-semibold sm:block">
          <span className="text-brand">Com7</span> Recruitment
        </p>
        <nav aria-label="เมนูแอดมิน" className="flex min-w-0 gap-1 overflow-x-auto">
          {me &&
            NAV.filter((n) => canAccess(me.role, n.section)).map((n) => (
              <Link
                key={n.section}
                href={n.href}
                aria-current={n.section === section ? 'page' : undefined}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  n.section === section ? 'bg-brand-tint text-brand-strong' : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                {n.label}
              </Link>
            ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {me && (
            <span className="hidden text-muted md:inline">
              {me.fullName || me.email} <span className="text-xs">({me.role})</span>
            </span>
          )}
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-muted hover:bg-surface hover:text-foreground"
          >
            <Icon name="logout" className="size-4" />
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <p className="m-6 rounded-lg bg-danger-tint p-3 text-sm text-danger">{error}</p>
        ) : !me ? (
          <p className="flex items-center gap-2 p-6 text-muted" role="status">
            <Spinner className="size-5" /> กำลังโหลด...
          </p>
        ) : !canAccess(me.role, section) ? (
          <p className="m-6 rounded-lg bg-warn-tint p-3 text-sm text-warn">บัญชีของคุณ ({me.role}) ไม่มีสิทธิ์ใช้งานหน้านี้</p>
        ) : (
          <AdminContext value={me}>{children}</AdminContext>
        )}
      </div>
    </div>
  );
}
