import type { Metadata } from 'next';
import { AdminShell } from '../shell';
import { OnboardingApp } from './onboarding-app';

export const metadata: Metadata = { title: 'แจ้งเริ่มงาน - Com7 Recruitment', robots: { index: false, follow: false } };

export default function OnboardingPage() {
  return (
    <AdminShell section="onboarding">
      <OnboardingApp />
    </AdminShell>
  );
}
