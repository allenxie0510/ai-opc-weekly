import type { ReactNode } from 'react';

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  small,
  className = '',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'accent' | 'outline' | 'ink';
  disabled?: boolean;
  small?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      className={`xpl-btn xpl-btn-${variant} ${small ? 'xpl-btn-sm' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' | 'blue';
}) {
  return <span className={`xpl-pill xpl-pill-${tone}`}>{children}</span>;
}

export function Head({
  kicker,
  title,
  desc,
}: {
  kicker?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="xpl-head">
      {kicker && <div className="xpl-kicker">{kicker}</div>}
      <h2 className="xpl-h2">{title}</h2>
      {desc && <p className="xpl-desc">{desc}</p>}
    </div>
  );
}

export function ScoreBar({
  label,
  value,
  max = 10,
  accent,
}: {
  label: string;
  value: number;
  max?: number;
  accent?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="xpl-scorebar-label">
        <span>{label}</span>
        <span className={accent ? 'xpl-scorebar-val accent' : 'xpl-scorebar-val'}>{value}</span>
      </div>
      <div className="xpl-scorebar-track">
        <div className={accent ? 'xpl-scorebar-fill accent' : 'xpl-scorebar-fill'} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="xpl-modal-overlay" onClick={onClose}>
      <div className="xpl-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xpl-modal-head">
          <h3>{title}</h3>
          <button className="xpl-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="xpl-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="xpl-field">
      <span className="xpl-field-label">{label}</span>
      {children}
      {hint && <span className="xpl-field-hint">{hint}</span>}
    </label>
  );
}

export function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: { id: number; label: string; sub: string }[];
  current: number;
  onGo: (i: number) => void;
}) {
  return (
    <div className="xpl-stepper">
      {steps.map((s, i) => (
        <button
          key={s.id}
          className={`xpl-step ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}
          onClick={() => onGo(i)}
        >
          <span className="xpl-step-dot">{i < current ? '✓' : i + 1}</span>
          <span className="xpl-step-text">
            <strong>{s.label}</strong>
            <small>{s.sub}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="xpl-empty">{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="xpl-spinner-wrap">
      <div className="xpl-spinner" />
      {label && <p>{label}</p>}
    </div>
  );
}
