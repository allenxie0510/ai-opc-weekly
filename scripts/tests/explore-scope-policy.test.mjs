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
const authSource = readFileSync(resolve(root, 'modules/explore/lib/auth.ts'), 'utf8');
const loginSource = readFileSync(resolve(root, 'modules/explore/components/LoginModal.tsx'), 'utf8');
const chatRouteSource = readFileSync(resolve(root, 'app/api/explore/chat/route.ts'), 'utf8');
const storageRouteSource = readFileSync(resolve(root, 'app/api/explore/storage/route.ts'), 'utf8');

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

test('方向探测器只展示已配置的邮箱登录方式', () => {
  assert.match(authSource, /sendEmailOtp/);
  assert.match(authSource, /verifyEmailOtp/);
  assert.match(authSource, /type: 'email'/);
  assert.doesNotMatch(authSource, /phone:/);
  assert.doesNotMatch(authSource, /type: 'sms'/);
  assert.match(loginSource, /当前仅支持邮箱登录/);
  assert.match(loginSource, /type="email"/);
  assert.match(loginSource, /6 位一次性验证码/);
  assert.match(loginSource, /autoComplete="one-time-code"/);
  assert.match(loginSource, /RESEND_SECONDS = 60/);
  assert.match(loginSource, /over_email_send_rate_limit/);
  assert.doesNotMatch(loginSource, /手机号|短信验证码/);
});

test('未登录用户不会获得方向探测器功能界面', () => {
  assert.match(appSource, /const \[authReady, setAuthReady\] = useState\(false\)/);
  assert.match(appSource, /if \(!mounted \|\| !authReady\)/);
  assert.match(appSource, /if \(!user\) \{/);
  assert.match(appSource, /方向探测器需要邮箱登录/);
  assert.match(appSource, /if \(mounted && user\) saveState/);
});

test('服务端 AI 代理强制校验登录并由客户端携带 token', () => {
  assert.match(aiSource, /const token = await getToken\(\)/);
  assert.match(aiSource, /Authorization: `Bearer \$\{token\}`/);
  assert.match(chatRouteSource, /const auth = await requireUser\(request\)/);
  assert.ok(chatRouteSource.indexOf('requireUser(request)') < chatRouteSource.indexOf('process.env.DEEPSEEK_API_KEY'));
  assert.match(chatRouteSource, /const rateLimitKey = auth\.userId/);
});

test('遗留云存储接口不再信任匿名 user_id', () => {
  assert.match(storageRouteSource, /requireUser\(request\)/g);
  assert.match(storageRouteSource, /auth\.userId/);
  assert.doesNotMatch(storageRouteSource, /searchParams\.get\('user_id'\)/);
  assert.doesNotMatch(storageRouteSource, /body\?\.user_id/);
});
