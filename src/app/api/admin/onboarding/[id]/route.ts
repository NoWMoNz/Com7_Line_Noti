/** แก้ข้อมูลเริ่มงาน: { name?, phone?, branch?, company?, position?, startDate?, salary?, ta?, notes? } */
import { adminRoute, readBody } from '@/lib/admin/http';
import { updateOnboardingInfo } from '@/lib/admin/onboarding-service';
import type { OnboardingInfoInput } from '@/lib/admin/types';

const FIELDS = ['name', 'phone', 'branch', 'company', 'position', 'startDate', 'salary', 'ta', 'notes'] as const;

export async function POST(request: Request, ctx: RouteContext<'/api/admin/onboarding/[id]'>) {
  const { id } = await ctx.params;
  const body = await readBody(request);
  const input: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) input[f] = body[f];
  return adminRoute((admin) => updateOnboardingInfo(admin, id, input as OnboardingInfoInput), 'onboarding');
}
