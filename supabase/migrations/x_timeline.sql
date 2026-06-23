-- X 推文时间轴功能

-- 关注账号表
CREATE TABLE IF NOT EXISTS twitter_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  rss_url text,
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 推文表
CREATE TABLE IF NOT EXISTS tweets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tweet_id text NOT NULL UNIQUE,
  author_username text NOT NULL,
  author_display_name text,
  author_avatar_url text,
  content text NOT NULL,
  published_at timestamptz NOT NULL,
  url text NOT NULL,
  media_urls jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_tweets_published_at ON tweets(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tweets_author ON tweets(author_username);
CREATE INDEX IF NOT EXISTS idx_twitter_accounts_enabled ON twitter_accounts(enabled);

-- 种子账号 — AI 圈重要大佬/组织
INSERT INTO twitter_accounts (username, display_name, avatar_url) VALUES
  ('sama', 'Sam Altman', 'https://unavatar.io/x/sama'),
  ('kaboroevich', 'Kabo', 'https://unavatar.io/x/kaboroevich'),
  ('AravSrinivas', 'Aravind Srinivas', 'https://unavatar.io/x/AravSrinivas'),
  ('EMostaque', 'Emad Mostaque', 'https://unavatar.io/x/EMostaque'),
  ('karminski3', 'karminski-牙医', 'https://unavatar.io/x/karminski3'),
  ('Khazix0918', '卡兹克', 'https://unavatar.io/x/Khazix0918'),
  ('thexpin', 'X.PIN', 'https://unavatar.io/x/thexpin'),
  ('berryxia', 'Berry Xia', 'https://unavatar.io/x/berryxia'),
  ('omarsar0', 'Elvis (DAIR.AI)', 'https://unavatar.io/x/omarsar0'),
  ('kimmonismus', 'Kim', 'https://unavatar.io/x/kimmonismus'),
  ('fofrAI', 'fofr', 'https://unavatar.io/x/fofrAI'),
  ('testingcatalog', 'TestingCatalog', 'https://unavatar.io/x/testingcatalog'),
  ('alibaba_cloud', 'Alibaba Cloud', 'https://unavatar.io/x/alibaba_cloud'),
  ('Baidu_Inc', 'Baidu Inc.', 'https://unavatar.io/x/Baidu_Inc'),
  ('SiliconFlowAI', 'SiliconFlow', 'https://unavatar.io/x/SiliconFlowAI')
ON CONFLICT (username) DO NOTHING;
