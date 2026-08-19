import { execFile } from 'node:child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  // ?diag=1 → 环境诊断（验证 serverless 环境 curl 可用性等，无敏感信息）
  if (new URL(req.url).searchParams.get('diag') === '1') {
    const curl = await new Promise<string>((res) => {
      execFile('curl', ['--version'], { timeout: 5000 }, (err, stdout) => {
        res(err ? `missing: ${err.message}` : stdout.split('\n')[0]);
      });
    });
    return Response.json({ ok: true, time: Date.now(), node: process.version, curl });
  }
  return Response.json({ ok: true, time: Date.now() });
}
