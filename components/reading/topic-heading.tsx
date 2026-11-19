const ENGLISH: Record<string, string> = {
  industry: 'INDUSTRY',
  tools: 'WORK SMARTER',
  business: 'BUSINESS',
  other: 'MORE TO KNOW',
};

export function TopicHeading({ lane, title }: { lane: string; title: string }) {
  return <span className="topic-heading"><span className="topic-heading-en" lang="en">{ENGLISH[lane] || 'INSIGHTS'}</span><span className="topic-heading-zh">{title}</span></span>;
}
