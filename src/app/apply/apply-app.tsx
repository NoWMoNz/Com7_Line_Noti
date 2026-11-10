'use client';

/**
 * หน้าผู้สมัคร (LINE MINI App) — ลงทะเบียน → ยินยอม PDPA → รออนุมัติ → ส่งเอกสาร
 *
 * เปิดจาก LINE: LIFF ให้ ID token → server ตรวจกับ LINE เพื่อรู้ว่าเป็นบัญชี LINE ไหน
 * เปิดจากเบราว์เซอร์: ใช้ token ในลิงก์ส่วนตัว (เหมือนระบบเดิม)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApplyResponse, ApplyState } from '@/lib/apply/types';
import { callApi, initLiff, readTokenFromUrl, uploadFiles, type LiffInfo } from './client-lib';
import { DocGroup, DocsHome, type DocTarget } from './docs';
import { PdpaScreen, PendingScreen, RegisterScreen, type RegisterInput } from './onboarding';
import { Button, Spinner, StatusPanel, TopBar } from '@/components/ui';
import { UploadScreen } from './upload';

type View = { name: 'home' } | { name: 'group'; docKey: string } | { name: 'upload'; docKey: string; subitemTitle?: string };

type Boot = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

export function ApplyApp({ liffId }: { liffId: string }) {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [state, setState] = useState<ApplyState | null>(null);
  const [views, setViews] = useState<View[]>([{ name: 'home' }]);
  const [toast, setToast] = useState<string | null>(null);
  const [liff, setLiff] = useState<LiffInfo>({ inClient: false, idToken: null });
  const started = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  /** รับผลจาก API: สำเร็จ → อัปเดตสถานะ, ผิดพลาด → คืนข้อความ */
  const apply = useCallback((res: ApplyResponse): string | null => {
    if (!res.ok) return res.error;
    setState(res.state);
    // เก็บ token ไว้ใน URL — รีเฟรชหน้าแล้วยังอยู่บัญชีเดิม
    if (res.state.token) {
      const url = new URL(window.location.href);
      if (url.searchParams.get('token') !== res.state.token) {
        url.searchParams.delete('liff.state');
        url.searchParams.set('token', res.state.token);
        window.history.replaceState(window.history.state, '', url);
      }
    }
    return null;
  }, []);

  // ---------- เริ่มต้น ----------
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let info: LiffInfo;
      try {
        info = await initLiff(liffId);
        setLiff(info);
      } catch {
        setBoot({ phase: 'error', message: 'เปิดผ่าน LINE ไม่สำเร็จ กรุณาปิดแล้วเปิดหน้านี้ใหม่อีกครั้ง' });
        return;
      }
      const res = await callApi('session', { token: readTokenFromUrl(), idToken: info.idToken });
      const err = apply(res);
      setBoot(err ? { phase: 'error', message: err } : { phase: 'ready' });
    })();
  }, [liffId, apply]);

  // ---------- เปลี่ยนหน้าภายใน + ปุ่มย้อนกลับของเครื่อง ----------
  useEffect(() => {
    const onPop = () => setViews((v) => (v.length > 1 ? v.slice(0, -1) : v));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((v: View) => {
    window.history.pushState({ apply: true }, '');
    setViews((cur) => [...cur, v]);
    window.scrollTo(0, 0);
  }, []);
  const back = useCallback((steps = 1) => window.history.go(-steps), []);

  const openTarget = useCallback(
    (t: DocTarget) => {
      const all = state?.docs ? [state.docs.allInOne, ...state.docs.required, ...state.docs.optional] : [];
      const doc = all.find((d) => d?.key === t.docKey);
      if (!doc) return;
      if (!t.subitemTitle && doc.subitems.length > 0) push({ name: 'group', docKey: doc.key });
      else push({ name: 'upload', docKey: doc.key, subitemTitle: t.subitemTitle });
    },
    [state, push],
  );

  // ---------- คำสั่งต่างๆ ----------
  const token = state?.token ?? null;
  const idToken = liff.idToken;

  const register = async (input: RegisterInput) => {
    const err = apply(await callApi('register', { token, idToken, ...input, pdpaAccepted: true }));
    if (!err) showToast('ลงทะเบียนสำเร็จ');
    return err;
  };
  const acceptPdpa = async () => apply(await callApi('pdpa', { token, idToken }));
  const refresh = async () => {
    const err = apply(await callApi('status', { token }));
    if (err) showToast(err);
  };

  // ---------- แสดงผล ----------
  if (boot.phase === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-24 text-muted" role="status">
          <Spinner className="size-8 text-brand" />
          <p>กำลังตรวจสอบข้อมูล...</p>
        </div>
      </Shell>
    );
  }
  if (boot.phase === 'error' || !state) {
    return (
      <Shell>
        <StatusPanel icon="alert" tone="danger" title="เปิดหน้านี้ไม่สำเร็จ">
          <p>{boot.phase === 'error' ? boot.message : 'ไม่พบข้อมูล'}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            ลองใหม่
          </Button>
        </StatusPanel>
      </Shell>
    );
  }

  if (state.screen === 'register') {
    return (
      <Shell>
        <RegisterScreen initialName={state.name} initialPhone={state.phone} onSubmit={register} />
        <Toast message={toast} />
      </Shell>
    );
  }
  if (state.screen === 'pdpa') {
    return (
      <Shell>
        <PdpaScreen onAccept={acceptPdpa} />
      </Shell>
    );
  }
  if (state.screen === 'pending' || !state.docs) {
    return (
      <Shell>
        <PendingScreen name={state.name} onRefresh={refresh} />
        <Toast message={toast} />
      </Shell>
    );
  }

  const docs = state.docs;
  const allDocs = [docs.allInOne, ...docs.required, ...docs.optional];
  const view = views[views.length - 1];
  const viewDoc = view.name === 'home' ? null : allDocs.find((d) => d?.key === view.docKey) ?? null;

  let body: React.ReactNode;
  if (view.name === 'group' && viewDoc) {
    body = (
      <>
        <TopBar title="เลือกหัวข้อที่จะส่ง" onBack={() => back()} />
        <DocGroup doc={viewDoc} onOpen={openTarget} />
      </>
    );
  } else if (view.name === 'upload' && viewDoc) {
    const subitem = view.subitemTitle ? viewDoc.subitems.find((s) => s.title === view.subitemTitle) ?? null : null;
    body = (
      <>
        <TopBar title="แนบเอกสาร" onBack={() => back()} />
        <UploadScreen
          key={`${viewDoc.key}/${view.subitemTitle ?? ''}`}
          doc={viewDoc}
          subitem={subitem}
          maxUploadMb={state.maxUploadMb}
          onUpload={async (files, onProgress) => {
            const form = new FormData();
            form.set('token', token ?? '');
            form.set('docKey', viewDoc.key);
            form.set('subitemTitle', view.subitemTitle ?? '');
            files.forEach((f) => form.append('files', f, f.name));
            const res = await uploadFiles(form, onProgress);
            const err = apply(res);
            if (err) return err;
            showToast('ส่งเอกสารสำเร็จ');
            // ส่งหัวข้อย่อยครบทั้งกลุ่มแล้ว → กลับไปหน้ารายการหลักเลย
            const updated = res.ok ? [res.state.docs?.allInOne, ...(res.state.docs?.required ?? []), ...(res.state.docs?.optional ?? [])].find((d) => d?.key === viewDoc.key) : null;
            const groupDone = !!subitem && !!updated && updated.subDone >= updated.subRequired;
            back(groupDone && views.length >= 3 ? 2 : 1);
            return null;
          }}
        />
      </>
    );
  } else {
    body = (
      <DocsHome
        name={state.name}
        feedback={state.feedback}
        docs={docs}
        personalLink={liff.inClient ? null : state.personalLink}
        onOpen={openTarget}
      />
    );
  }

  return (
    <Shell>
      {body}
      <Toast message={toast} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-12">
      <p className="pt-4 text-xs font-semibold tracking-wide text-brand">Com7 · ส่งเอกสารสมัครงาน</p>
      {children}
    </main>
  );
}

function Toast({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 flex justify-center px-4">
      {message && (
        <p className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background shadow-lg">{message}</p>
      )}
    </div>
  );
}
