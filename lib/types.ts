export interface WeeklyIssue {
  id: string;
  slug: string;
  issue_number: number;
  year: number;
  week_number: number;
  week_start: string;
  week_end: string;
  title: string;
  summary: string;
  cover_image: string;
  status: 'draft' | 'published';
  published_at: string;
}

export interface NewsItem {
  id: string;
  weekly_issue_id: string;
  title: string;
  description: string;
  insight: string;
  category: Category;
  creator_level: 'high' | 'medium' | 'low';
  compound_potential: 'high' | 'medium' | 'low';
  mrr_range: string;
  pricing: string;
  mvp_time: string;
  refs: { label: string; url: string }[];
  tags: string[];
  rank: number;
}

export type Category = 'micro-saas' | 'design-assets' | 'automation' | 'content-monetize' | 'indie-tool' | 'digital-product';

// X 推文相关
export interface TwitterAccount {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  enabled: boolean;
  rss_url?: string;
  created_at: string;
}

export interface Tweet {
  id: string;
  tweet_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string;
  content: string;
  published_at: string;
  url: string;
  media_urls: string[];
  created_at: string;
}

export const CATEGORY_MAP: Record<Category, { label: string; cssClass: string }> = {
  'micro-saas': { label: '微SaaS', cssClass: 'cat-microsaas' },
  'design-assets': { label: '设计资产', cssClass: 'cat-design' },
  'automation': { label: '自动化', cssClass: 'cat-automation' },
  'content-monetize': { label: '内容变现', cssClass: 'cat-content' },
  'indie-tool': { label: '小而美', cssClass: 'cat-tool' },
  'digital-product': { label: '虚拟产品', cssClass: 'cat-digital' },
};

export interface IssueNav {
  current: WeeklyIssue | null;
  newer: WeeklyIssue | null;
  older: WeeklyIssue | null;
}
