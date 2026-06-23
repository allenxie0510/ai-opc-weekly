'use client';

import { useState } from 'react';

async function translateText(text: string): Promise<string> {
  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`
  );
  const data = await res.json();
  return data[0]?.map((s: [string]) => s[0]).join('') || '';
}

export function TranslateButton({ text }: { text: string }) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (translated) {
    return (
      <div className="x-translated">
        <p>{translated}</p>
        <button
          className="x-translate-btn"
          onClick={() => setTranslated(null)}
          style={{ fontSize: 12, color: 'var(--color-steel)' }}
        >
          收起翻译
        </button>
      </div>
    );
  }

  return (
    <button
      className="x-translate-btn"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const result = await translateText(text);
          setTranslated(result || '翻译失败');
        } catch {
          setTranslated('翻译失败');
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? '翻译中...' : '翻译'}
    </button>
  );
}
