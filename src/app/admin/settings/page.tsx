import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { SettingsApp } from './settings-app';

export const metadata: Metadata = { title: 'ตั้งค่า - Com7 Recruitment', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <AdminShell section="settings">
      <SettingsApp />
    </AdminShell>
  );
}
