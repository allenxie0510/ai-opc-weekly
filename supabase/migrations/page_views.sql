-- Supabase SQL Editor 执行以下全部内容

-- 计数器主表
CREATE TABLE IF NOT EXISTS page_views (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0
);
INSERT INTO page_views (key, count) VALUES ('total', 0) ON CONFLICT DO NOTHING;

-- 访问日志表（按天+uid去重）
CREATE TABLE IF NOT EXISTS page_views_log (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_views_log_uid_date ON page_views_log(uid, date);

-- RPC 增量函数
CREATE OR REPLACE FUNCTION increment_view_count()
RETURNS void AS $$
BEGIN
  INSERT INTO page_views (key, count) VALUES ('total', 1)
    ON CONFLICT (key) DO UPDATE SET count = page_views.count + 1;
END;
$$ LANGUAGE plpgsql;
