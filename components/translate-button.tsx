'use client';

import { useState } from 'react';

export function TranslateButton({ tweetId, text }: { tweetId: string; text: string }) {
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
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tweet_id: tweetId, text }),
          });
          const data = await res.json();
          if (data.translated_text) {
            setTranslated(data.translated_text);
          } else {
            setTranslated('翻译失败');
          }
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
