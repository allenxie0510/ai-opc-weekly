import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('周报整条链路：核实国内案例→六问草稿→队列状态；只有一条也保留，不泄露内部资料', () => {
  const dir = mkdtempSync(join(tmpdir(), 'editorial-pipeline-test-'));
  try {
    const output = join(dir, 'writes.json');
    const result = spawnSync(process.execPath, ['--import', resolve(root, 'scripts/tests/helpers/editorial-pipeline-mock.mjs'), resolve(root, 'scripts/generate-weekly.mjs')], { cwd: dir, encoding: 'utf8', timeout: 15000, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://editorial-pipeline.test', SUPABASE_SERVICE_ROLE_KEY: 'test-only', ZHIPU_API_KEY: 'test-only', EDITORIAL_RESEARCH_ENABLED: 'true', WEEKLY_DRY_RUN: 'false', WEEKLY_DRAFT: 'false', TEST_WRITES_PATH: output } });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const writes = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(writes.find(w => w.path.endsWith('/weekly_issues') && w.method === 'POST').body.status, 'draft');
    const news = writes.find(w => w.path.endsWith('/news_items')).body;
    assert.equal(news.length, 1);
    assert.equal(news[0].editorial_brief.operating_market, 'domestic');
    assert.equal(news[0].editorial_brief.evidence_grade, 'B');
    assert.equal(writes.find(w => w.path.endsWith('/editorial_research')).body.status, 'drafted');
    assert.doesNotMatch(JSON.stringify(news), /SECRET-|test-research/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
