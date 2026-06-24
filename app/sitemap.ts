import { getWeeklyIssues } from '@/lib/data';
import type { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await getWeeklyIssues();

  const weeklyUrls: MetadataRoute.Sitemap = issues.map((i) => ({
    url: `https://www.aiopcnews.com/weekly/${i.slug}`,
    lastModified: new Date(i.published_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  return [
    {
      url: 'https://www.aiopcnews.com',
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: 'https://www.aiopcnews.com/archive',
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: 'https://www.aiopcnews.com/x',
      changeFrequency: 'daily' as const,
      priority: 0.7,
    },
    ...weeklyUrls,
  ];
}
