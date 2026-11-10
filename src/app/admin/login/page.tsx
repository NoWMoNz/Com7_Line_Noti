import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'เข้าสู่ระบบแอดมิน - Com7', robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-background p-6 shadow-sm">
        <p className="text-sm font-semibold text-brand">Com7 Recruitment</p>
        <h1 className="mb-6 mt-1 text-xl font-bold">เข้าสู่ระบบแอดมิน</h1>
        <LoginForm />
      </div>
    </main>
  );
}
