-- News enrichment: add a category column and dedupe key for upserts.
-- The `fetch-news` edge function upserts on `url` so re-running the feed pull
-- never creates duplicate rows for the same article.

alter table news_items add column if not exists category text;

-- Unique key for on-conflict upserts (only where a url exists).
create unique index if not exists idx_news_url_unique
  on news_items(url) where url is not null;

create index if not exists idx_news_category on news_items(category);
