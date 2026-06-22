'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

interface Fav {
  id: string;
  savedAt: string;
  title?: string;
}

const CAT_LABELS: Record<string, string> = {
  'micro-saas': '微SaaS',
  'design-assets': '设计资产',
  'automation': '自动化',
  'content-monetize': '内容变现',
  'indie-tool': '小而美',
  'digital-product': '虚拟产品',
};

function DeepAnalysisModal({ item, onClose }: { item: Fav; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const prompt = `请对以下 AI 创业方向进行深度拆解分析：

【项目名称】${item.title || '未知项目'}
【收藏时间】${new Date(item.savedAt).toLocaleDateString('zh-CN')}

请从以下 10 个维度逐一评估，每个维度给出 2-4 句话的实质性分析：

1. 市场规模与增长潜力
2. 竞争格局与差异化空间
3. 商业模式与变现路径
4. 技术可行性（Vibe Coding 可实现程度）
5. 复利效应评估（数据/网络/品牌）
6. 进入壁垒与护城河
7. 目标用户画像与获客策略
8. MVP 最小可行产品路径（含时间估算）
9. 核心风险与应对策略
10. 综合创业建议与行动清单

输出格式要求：
- 每个维度以【维度名】开头
- 最后给出总体评分（1-10分）及一句话总结
- 分析要具体、可操作，避免泛泛而谈
- 针对独立创作者/AI Vibe Coder 的视角`;

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>🔍 深度拆解</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--color-stone)' }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-steel)', marginBottom: 12 }}>
          复制下方提示词到 <strong>ChatGPT / Claude / DeepSeek</strong> 获取完整分析报告
        </p>
        <pre style={{
          background: 'var(--color-surface)', borderRadius: 12, padding: 16,
          fontSize: 13, lineHeight: 1.6, color: 'var(--color-slate)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflowY: 'auto',
          border: '1px solid var(--color-hairline)',
        }}>{prompt}</pre>
        <button onClick={handleCopy} style={{
          width: '100%', marginTop: 12, padding: '10px 20px', borderRadius: 9999,
          border: 'none', background: copied ? 'var(--color-success-text)' : 'var(--color-blue)',
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          transition: 'background 0.2s',
        }}>
          {copied ? '✓ 已复制' : '📋 复制提示词'}
        </button>
      </div>
    </div>
  );
}

export default function FavoritesPage() {
  const [favs, setFavs] = useState<Fav[]>([]);
  const [analysisItem, setAnalysisItem] = useState<Fav | null>(null);

  useEffect(() => {
    try {
      setFavs(JSON.parse(localStorage.getItem('ai_trends_favorites') || '[]'));
    } catch {}
  }, []);

  return (
    <>
      <Header />
      <div className="container" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <header style={{ marginBottom: 48 }}>
          <h1 style={{ fontFamily: 'var(--font-brand)', fontSize: '2.2rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 8 }}>我的收藏</h1>
          <p style={{ color: 'var(--color-steel)', fontSize: '0.95rem' }}>
            已收藏 {favs.length} 个项目
          </p>
        </header>

        {favs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-stone)' }}>
            还没有收藏任何项目。浏览周报时点击书签图标即可收藏。
            <br />
            <Link href="/" style={{ color: 'var(--color-blue)', fontSize: '0.9rem', textDecoration: 'underline', marginTop: '24px', display: 'inline-block' }}>返回首页</Link>
          </div>
        ) : (
          <div className="fav-list">
            {favs.map((f) => (
              <div key={f.id} className="fav-item" style={{
                display: 'flex', alignItems: 'center', gap: 16,
                flexWrap: 'wrap', justifyContent: 'space-between',
              }}>
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>
                    {f.title || `项目 #${f.id.slice(0, 8)}`}
                  </h4>
                  <span style={{ fontSize: 12, color: 'var(--color-stone)' }}>
                    收藏于 {f.savedAt ? new Date(f.savedAt).toLocaleDateString('zh-CN') : ''}
                  </span>
                </div>
                <button
                  onClick={() => setAnalysisItem(f)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                    padding: '6px 16px', borderRadius: 9999, cursor: 'pointer',
                    border: '1px solid var(--color-hairline)', background: 'transparent',
                    color: 'var(--color-coral)', transition: 'all 0.2s ease',
                  }}
                >
                  🔍 深度拆解
                </button>
              </div>
            ))}
          </div>
        )}

        <footer style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-stone)', fontSize: '0.8rem' }}>
          <p>© 2026 AI OPC Weekly. All rights reserved.</p>
        </footer>

        {analysisItem && <DeepAnalysisModal item={analysisItem} onClose={() => setAnalysisItem(null)} />}
      </div>
    </>
  );
}
