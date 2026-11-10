'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, ErrorText, Spinner } from '@/components/ui';
import { getSupabaseBrowser } from '@/lib/supabase/browser';

const INPUT =
  'h-11 w-full rounded-lg border border-line bg-background px-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

/**
 * ตั้งรหัสผ่าน — เปิดจากลิงก์ 2 แบบ:
 *  - ?token_hash=...&type=recovery  (ลิงก์จาก npm run create-admin)
 *  - ?code=...                      (ลิงก์ในอีเมล "ลืมรหัสผ่าน")
 */
export function ResetForm() {
  const [phase, setPhase] = useState<'verifying' | 'ready' | 'invalid'>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = getSupabaseBrowser();
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const code = params.get('code');
      let ok = false;
      if (tokenHash) {
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
        ok = !err;
      } else if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        ok = !err;
      } else {
        ok = !!(await supabase.auth.getSession()).data.session;
      }
      // ลบ token ออกจากแถบที่อยู่ ไม่ให้ค้างในประวัติเบราว์เซอร์
      window.history.replaceState(null, '', window.location.pathname);
      setPhase(ok ? 'ready' : 'invalid');
    })();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
    if (password !== confirm) return setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    const { error: err } = await getSupabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(err.message);
    window.location.replace('/admin');
  }

  if (phase === 'verifying') {
    return (
      <p className="flex items-center gap-2 text-muted" role="status">
        <Spinner className="size-5" /> กำลังตรวจสอบลิงก์...
      </p>
    );
  }
  if (phase === 'invalid') {
    return (
      <div className="space-y-4">
        <ErrorText>ลิงก์นี้ใช้ไม่ได้หรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่</ErrorText>
        <a href="/admin/login" className="block text-center text-sm font-semibold text-brand underline underline-offset-2">
          กลับไปหน้าเข้าสู่ระบบ
        </a>
      </div>
    );
  }
  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="new-password" className="text-sm font-semibold">
          รหัสผ่านใหม่
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={INPUT}
        />
        <p className="text-xs text-muted">อย่างน้อย 8 ตัวอักษร</p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="text-sm font-semibold">
          ยืนยันรหัสผ่าน
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={INPUT}
        />
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy}>
        บันทึกรหัสผ่าน
      </Button>
    </form>
  );
}
