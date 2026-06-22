import { getWeeklyIssues } from '@/lib/data';
import { Header } from '@/components/page-shell';
import Link from 'next/link';

export default async function ArchivePage() {
  const issues = await getWeeklyIssues();

  const byYear: Record<number, typeof issues> = {};
  issues.forEach(i => {
    if (!byYear[i.year]) byYear[i.year] = [];
    byYear[i.year].push(i);
  });

  const fmtDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  return (
    <>
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-brand)', letterSpacing: '0.04em' }}>全部周报</h1>
        <p className="text-sm text-[var(--color-steel)] mb-8">AI OPC Weekly 归档</p>

        {Object.keys(byYear).sort((a, b) => Number(b) - Number(a)).map(year => (
          <div key={year} className="mb-8">
            <h2 className="text-lg font-semibold mb-3 text-[var(--color-ink)]">{year}</h2>
            <div className="space-y-1">
              {byYear[Number(year)].map((i, idx) => (
                <Link
                  key={i.slug}
                  href={`/weekly/${i.slug}`}
                  className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white transition-colors group"
                >
                  <span className="text-sm font-semibold text-[var(--color-coral)] min-w-[48px]">
                    W{i.week_number}
                  </span>
                  <span className="text-sm text-[var(--color-slate)] flex-1">
                    {fmtDate(i.week_start)}–{fmtDate(i.week_end)}
                  </span>
                  {idx === 0 && (
                    <span className="text-[10px] font-medium text-[var(--color-coral)] bg-[#ff55300d] px-1.5 py-0.5 rounded-full">最新</span>
                  )}
                  <span className="text-xs text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </main>
    </>
  );
}
