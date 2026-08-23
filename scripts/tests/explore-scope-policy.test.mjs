import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const aiSource = readFileSync(resolve(root, 'modules/explore/lib/ai.ts'), 'utf8');
const generateSource = readFileSync(resolve(root, 'modules/explore/components/StepGenerate.tsx'), 'utf8');
const appSource = readFileSync(resolve(root, 'modules/explore/ExploreApp.tsx'), 'utf8');

test('用户选定的方向会进入模型画像并成为硬范围', () => {
  assert.match(aiSource, /本次探索主题\/方向（最高优先级范围边界）：\$\{p\.direction/);
  assert.match(aiSource, /【硬范围】只能在用户选定的/);
  assert.match(aiSource, /多样性必须来自该方向内部的不同目标用户/);
  assert.doesNotMatch(aiSource, /覆盖尽可能多样的大类/);
});

test('演示模式在方向明确时使用范围内样本', () => {
  assert.match(aiSource, /const scoped = Boolean\(scope\) && !crossIndustryRequested\(profile\)/);
  assert.match(aiSource, /seed = scopedMockSeed\(scope, i\)/);
  assert.match(aiSource, /\$\{direction\} · \$\{variant\.name\}/);
});

test('每次海量生成都替换旧候选池', () => {
  assert.match(generateSource, /let firstBatch = true/);
  assert.match(generateSource, /if \(firstBatch\) \{\s*onReplace\(p\.batch\)/);
  assert.match(appSource, /function replaceOpps\(list: Opportunity\[\]\)/);
  assert.match(appSource, /setOpportunities\(list\);\s*setPlans\(\{\}\)/);
});
