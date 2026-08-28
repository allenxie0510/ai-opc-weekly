import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { sendMagicLink, signOut } from '../lib/auth';
import { Button, Field, Modal } from './ui';

type Step = 'input' | 'sent';

export function LoginModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function send() {
    if (!email.trim()) return;
    setBusy(true);
    setErr('');
    setMsg('');
    const r = await sendMagicLink(email.trim());
    setBusy(false);
    if (r.ok) {
      setStep('sent');
      setMsg('登录链接已发送到邮箱，请点击邮件里的链接完成登录（邮件可能显示为英文 "Confirm your email address"）。');
    } else {
      setErr(r.error || '发送失败');
    }
  }

  return (
    <Modal open={open} title="登录 / 注册" onClose={onClose}>
      {user ? (
        <>
          <p className="xpl-small">已登录：{user.email || user.phone || user.id.slice(0, 8)}</p>
          <p className="xpl-small">登录后，你的「探索会话」和收藏将跨设备留存。</p>
          <div className="xpl-foot-row">
            <Button variant="ghost" onClick={async () => { await signOut(); onClose(); }}>退出登录</Button>
            <Button onClick={onClose}>关闭</Button>
          </div>
        </>
      ) : (
        <>
          <p className="xpl-small">
            仅「方向探测器」需要登录以保存/跨设备同步你的探索与收藏；浏览资讯无需登录。
            当前仅支持邮箱登录，我们会向你的邮箱发送一次性登录链接。
          </p>
          <Field label="邮箱">
            <input
              type="email"
              className="xpl-input"
              value={email}
              disabled={step !== 'input'}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
            />
          </Field>

          {msg && <p className="xpl-small" style={{ color: 'var(--color-success-text)' }}>{msg}</p>}
          {err && <div className="xpl-error">{err}</div>}

          <div className="xpl-foot-row">
            {step === 'input' && (
              <Button onClick={send} disabled={busy || !email.trim()}>
                {busy ? '发送中…' : '发送登录链接'}
              </Button>
            )}
            {step === 'sent' && (
              <>
                <Button variant="ghost" onClick={() => setStep('input')}>更换邮箱重发</Button>
                <Button variant="outline" onClick={() => window.location.reload()}>我已点完链接，刷新</Button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
