import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isEmail, sendOtp, signOut, verifyOtp } from '../lib/auth';
import { Button, Field, Modal } from './ui';

export function LoginModal({
  open,
  user,
  onClose,
}: {
  open: boolean;
  user: User | null;
  onClose: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setIdentifier('');
      setCode('');
      setStep('input');
      setMsg('');
      setErr('');
    }
  }, [open]);

  async function send() {
    if (!identifier.trim()) return;
    setBusy(true);
    setErr('');
    setMsg('');
    const r = await sendOtp(identifier.trim());
    setBusy(false);
    if (r.ok) {
      setStep('code');
      setMsg(
        isEmail(identifier)
          ? '验证码已发送到邮箱，请查收。'
          : '验证码已发送到手机（需在 Supabase 配置短信服务商）。'
      );
    } else {
      setErr(r.error || '发送失败');
    }
  }

  async function verify() {
    if (!identifier.trim() || !code.trim()) return;
    setBusy(true);
    setErr('');
    const r = await verifyOtp(identifier.trim(), code.trim());
    setBusy(false);
    if (r.ok) {
      onClose();
    } else {
      setErr(r.error || '验证失败');
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
          </p>
          <Field label="邮箱 或 手机号">
            <input
              className="xpl-input"
              value={identifier}
              disabled={step === 'code'}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com 或 +86 138xxxx"
            />
          </Field>
          {step === 'code' && (
            <Field label="验证码">
              <input
                className="xpl-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6 位验证码"
                autoFocus
              />
            </Field>
          )}
          {msg && <p className="xpl-small" style={{ color: 'var(--color-success-text)' }}>{msg}</p>}
          {err && <div className="xpl-error">{err}</div>}
          <div className="xpl-foot-row">
            {step === 'input' ? (
              <Button onClick={send} disabled={busy || !identifier.trim()}>
                {busy ? '发送中…' : '发送验证码'}
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setStep('input')}>返回</Button>
                <Button onClick={verify} disabled={busy || !code.trim()}>
                  {busy ? '验证中…' : '确认登录'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
