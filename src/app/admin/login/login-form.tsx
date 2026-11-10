'use client';

import { useState } from 'react';
import { Button, ErrorText } from '@/components/ui';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

const INPUT =
  'h-11 w-full rounded-lg border border-line bg-background px-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const supabase = getSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setBusy(false);
      setError(authError.message.includes('Invalid login') ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : authError.message);
      return;
    }
    // ต้องเป็นแอดมินที่เปิดใช้งานอยู่ด้วย ไม่ใช่แค่มีบัญชี
    const res = await fetch('/api/admin/me');
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      await supabase.auth.signOut();
      setBusy(false);
      setError(body?.error ?? 'บัญชีนี้ไม่มีสิทธิ์เข้าใช้งาน');
      return;
    }
    window.location.replace('/admin');
  }

  async function forgot() {
    setError(null);
    setInfo(null);
    if (!email.trim()) return setError('กรอกอีเมลก่อน แล้วกด "ลืมรหัสผ่าน" อีกครั้ง');
    setBusy(true);
    const { error: err } = await getSupabaseBrowser().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/admin/reset-password`,
    });
    setBusy(false);
    if (err) setError(err.message);
    else setInfo('ถ้าอีเมลนี้มีบัญชีอยู่ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้ กรุณาตรวจกล่องจดหมาย');
  }

  return (
    <form onSubmit={login} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-semibold">
          อีเมล
        </label>
        <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-semibold">
          รหัสผ่าน
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      {info && <p className="rounded-lg bg-brand-tint px-3 py-2 text-sm text-brand-strong">{info}</p>}
      <Button type="submit" busy={busy} disabled={!email || !password}>
        เข้าสู่ระบบ
      </Button>
      <button type="button" onClick={forgot} className="w-full text-center text-sm text-muted underline underline-offset-2 hover:text-foreground">
        ลืมรหัสผ่าน
      </button>
    </form>
  );
}
