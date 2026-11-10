import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { BranchesApp } from './branches-app';

export const metadata: Metadata = { title: 'สาขา - Com7 Recruitment', robots: { index: false, follow: false } };

export default function BranchesPage() {
  return (
    <AdminShell section="branches">
      <BranchesApp />
    </AdminShell>
  );
}
