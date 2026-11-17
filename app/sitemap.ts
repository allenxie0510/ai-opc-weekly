import { publishedBriefs, publishedRadar } from '@/lib/reading/data';
import { getWeeklyIssues, getOpportunities } from '@/lib/data';
import type { MetadataRoute } from 'next';
import { getProductRadarRepository } from '@/lib/product-radar/repository';
import { isProductRadarEnabled } from '@/lib/product-radar/config';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const issues = await getWeeklyIssues();
  const opps = await getOpportunities();
  const productRadarEnabled = isProductRadarEnabled();
  const productFeed = productRadarEnabled ? await getProductRadarRepository().list() : null;

  const weeklyUrls: MetadataRoute.Sitemap = issues.map((i) => ({
    url: `https://www.aiopcnews.com/weekly/${i.slug}`,
    lastModified: new Date(i.published_at),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const oppUrls: MetadataRoute.Sitemap = opps.map((o) => ({
    url: `https://www.aiopcnews.com/opportunities/${o.slug}`,
    lastModified: new Date(o.published_at),
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));

  const productRadarUrls: MetadataRoute.Sitemap = productFeed ? [
    { url: 'https://www.aiopcnews.com/tools', changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: 'https://www.aiopcnews.com/tools/xhs-product-radar', lastModified: new Date(productFeed.run.finishedAt), changeFrequency: 'daily' as const, priority: 0.9 },
    ...productFeed.items.map((item) => ({ url: `https://www.aiopcnews.com/tools/xhs-product-radar/${item.slug}`, lastModified: new Date(item.updatedAt), changeFrequency: 'daily' as const, priority: 0.8 })),
  ] : [];

  const [briefs, news] = await Promise.all([publishedBriefs(), publishedRadar()]);
  return [
    { url: 'https://www.aiopcnews.com/news', changeFrequency: 'daily', priority: 1 },
    ...briefs.map(b => ({ url: `https://www.aiopcnews.com/briefs/${b.slug}`, lastModified: new Date(b.published_at!), priority: 0.8 })),
    ...news.map(n => ({ url: `https://www.aiopcnews.com/news/${n.id}`, lastModified: new Date(n.publishedAt), priority: 0.8 })),
    { url: 'https://www.aiopcnews.com/about', changeFrequency: 'monthly', priority: 0.5 },
    { url: 'https://www.aiopcnews.com/explore', changeFrequency: 'monthly', priority: 0.9 },
    {
      url: 'https://www.aiopcnews.com',
      changeFrequency: 'weekly' as const,
      priority: 1,
    },
    {
      url: 'https://www.aiopcnews.com/opportunities',
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: 'https://www.aiopcnews.com/archive',
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
    {
      url: 'https://www.aiopcnews.com/news?view=all&source=x',
      changeFrequency: 'daily' as const,
      priority: 0.7,
    },
    ...productRadarUrls,
    ...oppUrls,
    ...weeklyUrls,
  ];
}
