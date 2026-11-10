import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { UsersApp } from './users-app';

export const metadata: Metadata = { title: 'ผู้ใช้ - Com7 Recruitment', robots: { index: false, follow: false } };

export default function UsersPage() {
  return (
    <AdminShell section="users">
      <UsersApp />
    </AdminShell>
  );
}
