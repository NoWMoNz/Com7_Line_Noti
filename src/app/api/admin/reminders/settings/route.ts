/** สวิตช์แจ้งเตือนอัตโนมัติ: { deadline: boolean, followup: boolean } */
import { adminDisplayName } from '@/lib/admin/auth';
import { adminRoute, readBody } from '@/lib/admin/http';
import { getAutoSettings, saveAutoSettings } from '@/lib/reminders/service';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  return adminRoute(() => getAutoSettings(), 'settings');
}

export async function POST(request: Request) {
  const body = await readBody(request);
  return adminRoute(async (admin) => {
    const saved = await saveAutoSettings({ deadline: body.deadline === true, followup: body.followup === true });
    await getSupabaseAdmin()
      .from('audit_log')
      .insert({ kind: 'audit', actor: adminDisplayName(admin), action: 'ตั้งค่าแจ้งเตือนอัตโนมัติ', field: 'auto_reminders', detail: JSON.stringify(saved) });
    return saved;
  }, 'settings');
}
