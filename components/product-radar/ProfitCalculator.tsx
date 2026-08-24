'use client';

import { useMemo, useState } from 'react';
import type { ProfitDefaults } from '@/lib/product-radar/domain';
import { calculateProfit } from '@/lib/product-radar/profit';
import { trackProductRadarEvent } from '@/lib/product-radar/client-events';

const FIELDS: Array<{ key: keyof ProfitDefaults; label: string; suffix: string; step: number }> = [
  { key: 'retailPrice', label: '售价', suffix: '元', step: 1 },
  { key: 'unitCost', label: '货品成本', suffix: '元', step: 0.1 },
  { key: 'shippingCost', label: '运费', suffix: '元', step: 0.1 },
  { key: 'packagingCost', label: '包材', suffix: '元', step: 0.1 },
  { key: 'platformFeeRate', label: '平台费率', suffix: '%', step: 0.5 },
  { key: 'returnAllowanceRate', label: '退货预留', suffix: '%', step: 0.5 },
  { key: 'promotionCost', label: '单件推广', suffix: '元', step: 1 },
];

export function ProfitCalculator({ defaults, slug }: { defaults: ProfitDefaults; slug: string }) {
  const [input, setInput] = useState(defaults);
  const result = useMemo(() => calculateProfit(input), [input]);
  const positive = result.contributionProfit > 0;
  return (
    <div className="pr-profit">
      <div className="pr-profit-inputs">
        {FIELDS.map((field) => <label key={field.key}><span>{field.label}</span><div><input type="number" min="0" step={field.step} value={input[field.key]} onChange={(event) => setInput((current) => ({ ...current, [field.key]: Number(event.target.value) }))} onBlur={() => trackProductRadarEvent('change_profit_input', { slug, field: field.key, value: input[field.key] })} /><em>{field.suffix}</em></div></label>)}
      </div>
      <div className={`pr-profit-result ${positive ? 'positive' : 'negative'}`} aria-live="polite">
        <span>单件贡献利润</span><strong>¥{result.contributionProfit.toFixed(2)}</strong>
        <span>贡献利润率</span><strong>{result.contributionMargin.toFixed(1)}%</strong>
        <span>可承受推广上限</span><strong>¥{result.breakEvenPromotionCost.toFixed(2)}</strong>
      </div>
      <details className="pr-profit-details"><summary>查看成本拆解</summary><p>平台费 ¥{result.platformFee.toFixed(2)} · 退货预留 ¥{result.returnAllowance.toFixed(2)} · 总变动成本 ¥{result.totalVariableCost.toFixed(2)}</p></details>
      <p className="pr-calculator-note">试算不含税费、人工和平台临时活动补贴，请用自己的实际参数。</p>
    </div>
  );
}
