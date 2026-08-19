import { execFile } from 'node:child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// diag=nitter 的白名单探测目标（写死，防开放代理滥用；只回状态码与字节数，不回 body）
const NITTER_PROBE_HOSTS = ['nitter.net', 'nitter.privacyredirect.com', 'xcancel.com'];

export async function GET(req: Request) {
  const diag = new URL(req.url).searchParams.get('diag');

  // ?diag=nitter → 从 Vercel 环境实测各 nitter 实例可达性（2026-08-19 全灭排查用）
  if (diag === 'nitter') {
    const probes = await Promise.all(
      NITTER_PROBE_HOSTS.map(
        (host) =>
          new Promise((res) => {
            const t0 = Date.now();
            execFile(
              'curl',
              ['-s', '-o', '/dev/null', '-m', '8', '-A', 'FreshRSS/1.24.0',
               '-w', '%{http_code} %{size_download}', `https://${host}/sama/rss`],
              { timeout: 12000 },
              (err, stdout) => {
                const [httpCode, bytes] = stdout.trim().split(' ');
                res({
                  host,
                  ms: Date.now() - t0,
                  http: httpCode || null,
                  bytes: bytes ? parseInt(bytes, 10) : null,
                  curlError: err ? String((err as NodeJS.ErrnoException).code || err.message) : null,
                });
              },
            );
          }),
      ),
    );
    return Response.json({ ok: true, time: Date.now(), probes });
  }

  // ?diag=1 → 环境诊断（验证 serverless 环境 curl 可用性等，无敏感信息）
  if (diag === '1') {
    const curl = await new Promise<string>((res) => {
      execFile('curl', ['--version'], { timeout: 5000 }, (err, stdout) => {
        res(err ? `missing: ${err.message}` : stdout.split('\n')[0]);
      });
    });
    return Response.json({ ok: true, time: Date.now(), node: process.version, curl });
  }
  return Response.json({ ok: true, time: Date.now() });
}
