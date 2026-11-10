import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { DocumentsApp } from './documents-app';

export const metadata: Metadata = { title: 'ตั้งค่าเอกสาร - Com7 Recruitment', robots: { index: false, follow: false } };

export default function DocumentsPage() {
  return (
    <AdminShell section="documents">
      <DocumentsApp />
    </AdminShell>
  );
}
