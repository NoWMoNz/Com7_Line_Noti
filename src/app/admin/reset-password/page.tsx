import type { Metadata } from 'next';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'ตั้งรหัสผ่าน - Com7', robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-background p-6 shadow-sm">
        <p className="text-sm font-semibold text-brand">Com7 Recruitment</p>
        <h1 className="mb-6 mt-1 text-xl font-bold">ตั้งรหัสผ่าน</h1>
        <ResetForm />
      </div>
    </main>
  );
}
