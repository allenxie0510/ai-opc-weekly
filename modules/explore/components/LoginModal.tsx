import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { sendEmailOtp, signOut, verifyEmailOtp, type AuthActionResult } from '../lib/auth';
import { Button, Field, Modal } from './ui';

type Step = 'input' | 'verify';

const RESEND_SECONDS = 60;
const LAST_SENT_KEY = 'aiopc_explore_email_otp_sent_at';

function authErrorText(result: AuthActionResult, action: 'send' | 'verify'): string {
  const code = result.code || '';
  const message = (result.error || '').toLowerCase();
  if (code === 'over_email_send_rate_limit' || message.includes('email rate limit exceeded')) {
    return '邮件发送额度暂时已用完，请稍后再试。若持续出现，需要管理员为 Supabase 配置正式 SMTP 邮件服务。';
  }
  if (code === 'over_request_rate_limit' || result.status === 429 || message.includes('rate limit')) {
    return '请求过于频繁，请等待倒计时结束后再重试。';
  }
  if (code === 'otp_expired' || message.includes('expired')) {
    return '验证码已过期或已被使用，请重新获取验证码。';
  }
  if (action === 'verify' && (message.includes('invalid') || code === 'invalid_credentials')) {
    return '验证码不正确，请检查邮件中的 6 位数字。';
  }
  return result.error || (action === 'send' ? '验证码发送失败，请稍后重试。' : '验证失败，请重试。');
}

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
  const [sentEmail, setSentEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<Step>('input');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const sentAt = Number(localStorage.getItem(LAST_SENT_KEY) || 0);
    const remaining = Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - sentAt) / 1000));
    setCooldown(remaining);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  function startCooldown() {
    localStorage.setItem(LAST_SENT_KEY, String(Date.now()));
    setCooldown(RESEND_SECONDS);
  }

  async function send() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || cooldown > 0) return;
    setBusy(true);
    setErr('');
    setMsg('');
    const r = await sendEmailOtp(normalizedEmail);
    setBusy(false);
    if (r.ok) {
      setSentEmail(normalizedEmail);
      setStep('verify');
      startCooldown();
      setMsg(`6 位验证码已发送到 ${normalizedEmail}，请在当前页面输入。`);
    } else {
      if (r.status === 429 || r.code?.includes('rate_limit')) startCooldown();
      setErr(authErrorText(r, 'send'));
    }
  }

  async function verify() {
    if (!sentEmail || !/^\d{6}$/.test(otp)) return;
    setBusy(true);
    setErr('');
    const r = await verifyEmailOtp(sentEmail, otp);
    setBusy(false);
    if (r.ok) {
      localStorage.removeItem(LAST_SENT_KEY);
      setMsg('登录成功，正在进入方向探测器…');
    } else {
      setErr(authErrorText(r, 'verify'));
    }
  }

  function changeEmail() {
    setStep('input');
    setOtp('');
    setSentEmail('');
    setMsg('');
    setErr('');
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
            「方向探测器」的方向建议、机会生成、筛选和规划功能仅向登录用户开放；浏览资讯无需登录。
            当前仅支持邮箱登录，我们会向你的邮箱发送 6 位一次性验证码。
          </p>
          {step === 'input' ? (
            <Field label="邮箱">
              <input
                type="email"
                className="xpl-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void send()}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
              />
            </Field>
          ) : (
            <Field label={`邮箱验证码 · ${sentEmail}`}>
              <input
                type="text"
                className="xpl-input xpl-otp-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && void verify()}
                placeholder="000000"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </Field>
          )}

          {msg && <p className="xpl-small" style={{ color: 'var(--color-success-text)' }}>{msg}</p>}
          {err && <div className="xpl-error">{err}</div>}

          <div className="xpl-foot-row">
            {step === 'input' && (
              <Button onClick={send} disabled={busy || !email.trim() || cooldown > 0}>
                {busy ? '发送中…' : cooldown > 0 ? `${cooldown} 秒后可重发` : '发送验证码'}
              </Button>
            )}
            {step === 'verify' && (
              <>
                <Button variant="ghost" onClick={changeEmail}>更换邮箱</Button>
                <Button variant="outline" onClick={send} disabled={busy || cooldown > 0}>
                  {cooldown > 0 ? `${cooldown} 秒后可重发` : '重新发送'}
                </Button>
                <Button onClick={verify} disabled={busy || !/^\d{6}$/.test(otp)}>
                  {busy ? '验证中…' : '验证并登录'}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
