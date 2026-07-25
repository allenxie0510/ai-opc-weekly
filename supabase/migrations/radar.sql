-- OPC Radar · 一人雷达 日更快讯功能

-- 素材池：抓取脚本的写入目标
CREATE TABLE IF NOT EXISTS radar_candidates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_name text NOT NULL,
  source_url text NOT NULL,
  title text NOT NULL,
  snippet text,
  published_at timestamptz,
  fetched_at timestamptz DEFAULT now()
);

-- 按 source_url 去重 upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_radar_candidates_source_url ON radar_candidates(source_url);
CREATE INDEX IF NOT EXISTS idx_radar_candidates_fetched_at ON radar_candidates(fetched_at DESC);

-- 成品快讯
CREATE TABLE IF NOT EXISTS radar_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  summary text,
  source_name text,
  source_url text,
  score int,
  editor_note text,
  pick_reason text,
  category text,
  status text DEFAULT 'draft',
  reject_reason text,
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_radar_items_status ON radar_items(status);
CREATE INDEX IF NOT EXISTS idx_radar_items_published_at ON radar_items(published_at DESC);
