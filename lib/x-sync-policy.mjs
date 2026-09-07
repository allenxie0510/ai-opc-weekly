export function selectSyncAccounts(accounts, target = '', now = Date.now()) {
  const active = accounts.filter((account) => account.enabled !== false);
  if (target) return active.filter((account) => account.username.toLowerCase() === target.toLowerCase());
  const offset = active.length ? Math.floor(now / 3_600_000) % active.length : 0;
  return [...active.slice(offset), ...active.slice(0, offset)];
}

export function summarizeSync(results) {
  const succeeded = results.filter((result) => result.ok).length;
  return { total: results.length, succeeded, failed: results.length - succeeded,
    status: results.length === 0 ? 'empty' : succeeded === results.length ? 'success' : succeeded === 0 ? 'failed' : 'partial' };
}
