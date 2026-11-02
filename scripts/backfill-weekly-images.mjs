/** node --env-file=.env.local scripts/backfill-weekly-images.mjs --issue=2026-w45 */
import { backfillWeeklyImages } from './lib/weekly-images.mjs';
const slug = process.argv.find(arg => arg.startsWith('--issue='))?.slice(8);
if (!slug) throw new Error('请提供 --issue=YYYY-wNN，避免意外改动其他期数');
console.log(JSON.stringify(await backfillWeeklyImages(slug)));
