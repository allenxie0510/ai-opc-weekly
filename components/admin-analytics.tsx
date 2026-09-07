'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AnalyticsOverview } from '@/lib/analytics';

const METRICS = [
  { key: 'visitors', label: '访客', detail: '浏览器标识去重，不等于自然人数' },
  { key: 'registrations', label: '新增注册', detail: '首次完成邮箱验证' },
  { key: 'activeUsers', label: '活跃用户', detail: '有行为的已登录用户去重' },
  { key: 'completions', label: '探测器完成数', detail: '非演示规划成功生成次数（客户端上报）' },
] as const;
const STEPS = ['访问', '阅读机会', '注册', '完成方向研究', '保存结果或付费'];
function Trend({ values, label }: { values: Array<number | null>; label: string }) {
  const max = Math.max(1, ...values.map(v => v || 0));
  const points = values.map((v, i) => v === null ? null : `${8 + i * 224 / Math.max(1, values.length - 1)},${52 - v / max * 44}`).filter(Boolean);
  return <svg viewBox="0 0 240 60" className="analytics-trend" role="img" aria-label={`${label}每日趋势，精确数值见下方每日明细`}>
    <path d="M8 52H232" stroke="var(--color-hairline)" fill="none" />
    {points.length > 1 && <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />}
    {points.length === 1 && <circle cx={points[0]!.split(',')[0]} cy={points[0]!.split(',')[1]} r="3" fill="currentColor" />}
  </svg>;
}
export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(7);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/analytics', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '数据加载失败');
      setData(result); setError('');
    } catch (e) { setData(null); setError(e instanceof Error ? e.message : '数据加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const initial = setTimeout(() => { void load(); }, 0); const refresh = () => { void load(); }; window.addEventListener('focus', refresh); return () => { clearTimeout(initial); window.removeEventListener('focus', refresh); }; }, [load]);
  const period = data?.periods.find(p => p.days === range);
  const days = data?.days.slice(-range) || [];
  return <section className="admin-section analytics-panel" aria-labelledby="analytics-title">
    <div className="admin-section-head">
      <div><h2 id="analytics-title">管理员数据概览</h2><p className="analytics-note">仅管理员可见 · 北京时间 · 不采集邮箱、IP、研究正文</p></div>
      <button className="admin-btn" onClick={() => { setLoading(true); void load(); }} disabled={loading}>{loading ? '加载中…' : '刷新数据'}</button>
    </div>
    {error && <p className="analytics-error" role="alert">{error}</p>}
    {data && period && <>
      <div className="analytics-kpis">
        {METRICS.map(metric => <article className="analytics-kpi" key={metric.key}>
          <h3>今日{metric.label}</h3><strong>{data.today[metric.key].toLocaleString('zh-CN')}</strong><p>{metric.detail}</p>
        </article>)}
      </div>
      <p className="analytics-note">累计访问数（旧计数延续）：{data.legacyTotal === null ? '暂不可用' : data.legacyTotal.toLocaleString('zh-CN')}。该累计为历史计数与每日访客计数之和，不是跨天去重人数。</p>
      <div className="analytics-range" role="group" aria-label="趋势统计范围">
        {[7, 30].map(n => <button className="admin-btn" key={n} aria-pressed={range === n} onClick={() => setRange(n as 7 | 30)}>近 {n} 天</button>)}
      </div>
      <p className="analytics-note">行为统计自 {new Date(data.startedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 启用，当天为部分数据。此前行为显示「—」，不填假零；注册历史按邮箱验证记录还原。</p>
      <div className="analytics-kpis">
        {METRICS.map(metric => <article className="analytics-kpi" key={metric.key}>
          <h3>近 {range} 天 · {metric.label}</h3><strong>{period.totals[metric.key].toLocaleString('zh-CN')}</strong>
          <Trend label={metric.label} values={days.map(day => !day.covered && metric.key !== 'registrations' ? null : day[metric.key])} />
          <p>{metric.key === 'visitors' || metric.key === 'activeUsers' ? '周期内去重，不是每日数相加' : '周期内合计'}</p>
        </article>)}
      </div>
      <h3 className="analytics-subtitle">核心转化路径 · 近 {range} 天</h3>
      <p className="analytics-note">同一访客在所选周期内依次完成各步；注册后按同一账号跨设备关联。已有账号直接使用不会算作新增注册转化。阅读指机会详情前台可见累计停留 10 秒。</p>
      <ol className="analytics-funnel">
        {STEPS.map((step, i) => <li key={step}><span>{i + 1}. {step}</span><strong>{period.funnel[i]}</strong><small>{i === 0 ? '起点访客' : period.funnel[i - 1] ? `上一步转化 ${(100 * period.funnel[i] / period.funnel[i - 1]).toFixed(1)}%` : '上一步无样本'}</small></li>)}
      </ol>
      <p className="analytics-note">保存：服务端确认带规划结果的探索保存成功后记录。付费：接口预留，未接入支付，不展示付费率或收入。漏斗按访客计数，非跨浏览器自然人去重；屏蔽统计或清除 Cookie 可能造成缺失。</p>
      <details className="analytics-details"><summary>查看每日明细与统计口径</summary>
        <div className="analytics-table-wrap"><table><caption>最近 {range} 天数据（北京时间）</caption><thead><tr><th>日期</th>{METRICS.map(m => <th key={m.key}>{m.label}</th>)}<th>保存用户</th></tr></thead>
          <tbody>{[...days].reverse().map(day => <tr key={day.day}><th scope="row">{day.day}</th>{METRICS.map(m => <td key={m.key}>{!day.covered && m.key !== 'registrations' ? '—' : day[m.key]}</td>)}<td>{day.covered ? day.savers : '—'}</td></tr>)}</tbody></table></div>
        <p className="analytics-note">管理员会话、已识别机器人及 DNT/GPC 请求不记录行为。完成数是登录用户成功生成非演示规划后的客户端上报，不等同于服务端验收，也不表示创业结果。重新生成计作新的完成，网络重试按事件 ID 去重。未开启或被拦截的历史行为无法补算。</p>
      </details>
      <p className="analytics-note">数据截止 {new Date(data.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    </>}
  </section>;
}
