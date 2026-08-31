import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIN_WEEKLY_ITEMS,
  buildMaterialIndex,
  filterGroundedRefs,
  productIdentity,
  weeklyIssuePlan,
} from '../lib/weekly-policy.mjs';
import {
  buildWeeklyRankUpdates,
  updateGeneratedWeeklySummaryCount,
} from '../../lib/weekly-admin.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

test('weekly issue stays retryable until at least five items exist', () => {
  assert.equal(MIN_WEEKLY_ITEMS, 5);
  assert.deepEqual(weeklyIssuePlan(null, 0), {
    skip: false,
    reason: 'new-issue',
    existingCount: 0,
    needed: 6,
  });
  assert.equal(weeklyIssuePlan({ status: 'draft' }, 1).needed, 5);
  assert.equal(weeklyIssuePlan({ status: 'draft' }, 4).skip, false);
  assert.equal(weeklyIssuePlan({ status: 'draft' }, 5).skip, true);
  assert.equal(weeklyIssuePlan({ status: 'published' }, 1).skip, true);
});

test('model references must resolve to an ingested source URL', () => {
  const materials = [{
    source_name: 'Product Hunt',
    source_url: 'https://www.producthunt.com/products/real-tool?utm_source=api',
  }];
  const refs = filterGroundedRefs([
    { label: 'real', url: 'https://www.producthunt.com/products/real-tool' },
    { label: 'invented', url: 'https://example.com/fake-tool' },
  ], buildMaterialIndex(materials));
  assert.deepEqual(refs, [{ label: 'real', url: materials[0].source_url }]);
});

test('product identity deduplicates by product name instead of generic Chinese words', () => {
  assert.equal(productIdentity('CodeRabbit：AI 代码审查工具'), 'coderabbit');
  assert.equal(productIdentity('Screen Studio：AI 视频工具'), 'screen studio');
  assert.notEqual(productIdentity('CodeRabbit：AI 工具'), productIdentity('Screen Studio：AI 工具'));
});

test('weekly workflow refreshes sources and serializes retries', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/weekly-newsletter.yml'), 'utf8');
  const generator = readFileSync(resolve(root, 'scripts/generate-weekly.mjs'), 'utf8');
  assert.match(workflow, /concurrency:\s+group: weekly-newsletter\s+cancel-in-progress: false/);
  assert.match(workflow, /Refresh source pool[\s\S]*node scripts\/fetch-sources\.mjs/);
  assert.doesNotMatch(workflow, /Check if already published this week/);
  assert.match(generator, /weeklyIssuePlan\(existingIssue/);
  assert.match(generator, /totalAfterRun < MIN_WEEKLY_ITEMS/);
  assert.match(generator, /filterGroundedRefs/);
  assert.match(generator, /selectCandidateMaterials/);
});

test('single weekly item deletion keeps ranks contiguous and updates only generated summaries', () => {
  assert.deepEqual(
    buildWeeklyRankUpdates([
      { id: 'a', rank: 1 },
      { id: 'c', rank: 3 },
      { id: 'd', rank: 4 },
    ]),
    [
      { id: 'c', rank: 2 },
      { id: 'd', rank: 3 },
    ],
  );
  assert.equal(
    updateGeneratedWeeklySummaryCount('本周 5 个深度拆解：AI × 一人公司创业。', 4),
    '本周 4 个深度拆解：AI × 一人公司创业。',
  );
  assert.equal(updateGeneratedWeeklySummaryCount('管理员自定义摘要', 4), '管理员自定义摘要');
});

test('admin review and action routes expose item ids and single-item discard', () => {
  const review = readFileSync(resolve(root, 'app/api/admin/review/route.ts'), 'utf8');
  const publish = readFileSync(resolve(root, 'app/api/admin/publish/route.ts'), 'utf8');
  const admin = readFileSync(resolve(root, 'app/admin/page.tsx'), 'utf8');
  assert.match(review, /select\('id, title, section, rank'\)/);
  assert.match(publish, /type === 'news_item'/);
  assert.match(admin, /删除本条/);
});
