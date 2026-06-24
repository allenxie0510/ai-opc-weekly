'use client';

import { useEffect, useState } from 'react';

function getUid(): string {
  const key = 'ai_opc_visitor_uid';
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(key, uid);
  }
  return uid;
}

export function PageViewCounter({ label }: { label?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const uid = getUid();

    (async () => {
      try {
        // 记录访问 + 获取总数
        const res = await fetch('/api/views', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
        const data = await res.json();
        if (data.count !== undefined) setCount(data.count);
      } catch {
        // 降级：只取不记
        try {
          const res = await fetch('/api/views');
          const data = await res.json();
          if (data.count !== undefined) setCount(data.count);
        } catch { /* silent */ }
      }
    })();
  }, []);

  if (count === null) return null;

  return (
    <span style={{ color: 'var(--color-steel)', fontSize: 13 }}>
      {label || '累计'} {count.toLocaleString()} 次访问
    </span>
  );
}
