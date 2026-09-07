export type XSyncStatus = { state: 'running' | 'success' | 'failed' | 'legacy' | 'unknown'; checkedAt: string | null };

/** Read scheduler receipts, never infer a successful sync from tweet publication time. */
export async function getXSyncStatus(): Promise<XSyncStatus> {
  try {
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_PAT) headers.Authorization = `Bearer ${process.env.GITHUB_PAT}`;
    const response = await fetch('https://api.github.com/repos/allenxie0510/ai-opc-weekly/actions/workflows/fetch-tweets.yml/runs?per_page=10', {
      headers, next: { revalidate: 120 }, signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('status unavailable');
    const data = await response.json();
    const run = data.workflow_runs?.find((item: { display_title?: string }) =>
      !item.display_title?.startsWith('X sync / ') || item.display_title === 'X sync / all');
    if (!run) throw new Error('no run');
    const state = run.status !== 'completed' ? 'running'
      : run.conclusion !== 'success' ? 'failed'
      : run.display_title === 'X sync / all' ? 'success' : 'legacy';
    return { state, checkedAt: run.status === 'completed' ? run.updated_at : run.run_started_at || run.created_at };
  } catch { return { state: 'unknown', checkedAt: null }; }
}
