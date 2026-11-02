-- Original-source cover images for weekly articles; existing content remains valid.
ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.news_items ADD COLUMN IF NOT EXISTS image_source_url text;
COMMENT ON COLUMN public.news_items.image_url IS 'Verified source-page raster image copied to Supabase Storage';
COMMENT ON COLUMN public.news_items.image_source_url IS 'Original webpage for image attribution';
NOTIFY pgrst, 'reload schema';
