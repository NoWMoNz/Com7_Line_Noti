import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { OverviewApp } from './overview-app';

export const metadata: Metadata = { title: 'ภาพรวม - Com7 Recruitment', robots: { index: false, follow: false } };

export default function Page() {
  return (
    <AdminShell section="overview">
      <OverviewApp />
    </AdminShell>
  );
}
