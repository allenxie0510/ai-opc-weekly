import type { BackcastPlan, Opportunity, ThemeProfile } from './types';

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 生成专业排版的逆向规划 PDF（浏览器打印 → 另存为 PDF，矢量文字、中文无乱码） */
export function exportPlanPdf(opp: Opportunity, plan: BackcastPlan, profile: ThemeProfile): void {
  const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  const milestones = plan.milestones
    .map(
      (m, i) => `
      <section class="milestone">
        <div class="m-head">
          <span class="m-time">${esc(m.timeLabel)}</span>
          <span class="m-tag">${i === 0 ? '从这里出发' : '倒推 ↑'}</span>
        </div>
        <h3>${esc(m.goal)}</h3>
        ${m.keyResults?.length ? `<ul class="kr">${m.keyResults.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
        <div class="m-meta">
          <p><b>所需资源</b>${esc(m.resources)}</p>
          <p><b>待验证假设</b>${esc(m.assumptions)}</p>
          <p><b>风险</b>${esc(m.risks)}</p>
        </div>
      </section>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc(opp.name)} · 逆向规划</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; color:#1a1a1a; line-height:1.6; }
  .page { max-width: 720px; margin: 0 auto; padding: 48px 56px; }
  .brand { display:flex; align-items:center; gap:8px; font-size:12px; letter-spacing:0.12em; color:#1456f0; text-transform:uppercase; font-weight:700; }
  .brand::before { content:''; width:7px; height:7px; background:#1456f0; border-radius:50%; }
  h1 { font-size: 26px; margin: 14px 0 4px; line-height:1.3; }
  .sub { color:#45515e; font-size: 14px; margin-bottom: 22px; }
  .rule { height:1px; background:#e5e7eb; margin: 22px 0; }
  .vision { background:#f6f8fc; border-left:3px solid #1456f0; padding: 16px 20px; border-radius: 0 10px 10px 0; }
  .vision .lbl { font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#1456f0; font-weight:700; }
  .vision h2 { font-size:18px; margin:8px 0 6px; line-height:1.5; }
  .vision p { font-size:13px; color:#45515e; }
  h3.sec { font-size:13px; letter-spacing:0.08em; text-transform:uppercase; color:#8e8e93; margin: 26px 0 14px; }
  .milestone { border:1px solid #e5e7eb; border-radius:12px; padding: 16px 20px; margin-bottom: 14px; }
  .m-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .m-time { font-size:15px; font-weight:700; color:#1456f0; }
  .m-tag { font-size:11px; color:#8e8e93; }
  .milestone h3 { font-size:15px; margin-bottom:8px; }
  .kr { margin:0 0 10px 18px; font-size:13px; color:#222; }
  .kr li { margin:2px 0; }
  .m-meta p { font-size:12.5px; color:#45515e; margin:3px 0; }
  .m-meta b { color:#1a1a1a; margin-right:6px; font-weight:600; }
  .first { background:#eefaf3; border:1px solid #bfe6cf; border-radius:12px; padding: 16px 20px; margin-top: 20px; }
  .first .lbl { font-size:11px; letter-spacing:0.1em; color:#0a7d4f; font-weight:700; text-transform:uppercase; }
  .first p { font-size:14px; margin-top:8px; }
  .foot { margin-top: 34px; padding-top: 16px; border-top:1px solid #e5e7eb; font-size:11px; color:#8e8e93; display:flex; justify-content:space-between; }
</style>
</head>
<body>
<div class="page">
  <div class="brand">AI OPC · 方向探测器</div>
  <h1>${esc(opp.name)} · 逆向规划</h1>
  <p class="sub">${esc(opp.oneLiner)} · ${esc(opp.category)} · ${date}</p>

  <div class="vision">
    <div class="lbl">终局愿景（${profile.horizonYears || 10} 年后）</div>
    <h2>${esc(plan.finalVision)}</h2>
    <p>成功度量：${esc(plan.successMetric)}</p>
  </div>

  <h3 class="sec">倒推里程碑（从终点倒推回现在）</h3>
  ${milestones}

  <div class="first">
    <div class="lbl">本周第一步（现在就做）</div>
    <p>${esc(plan.firstStep)}</p>
  </div>

  <div class="foot">
    <span>方向与规划由 AI 生成，仅供参考，不构成投资建议</span>
    <span>AI OPC · 一人公司创业机会情报</span>
  </div>
</div>
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) {
    alert('请允许浏览器弹出窗口以导出 PDF');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
}
