import { redirect } from 'next/navigation';
import { getLatestIssue } from '@/lib/data';

export const revalidate = 300;

export default async function Home() {
  const latest = await getLatestIssue();
  if (latest) {
    redirect(`/weekly/${latest.slug}`);
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold mb-4">AI OPC Weekly</h1>
      <p className="text-[var(--color-steel)]">暂无已发布的周报。</p>
    </div>
  );
}
