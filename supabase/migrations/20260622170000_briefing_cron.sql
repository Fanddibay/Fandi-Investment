-- Daily-brief heartbeat cron job.
-- Pings send-briefing every minute; the function self-gates on the configured
-- WIB schedule slot, so it sends exactly once per slot at/after briefing_time.
-- Uses the public publishable key as bearer (verify_jwt accepts it; publishable
-- keys are designed to be client-visible). Idempotent: re-running re-creates it.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any prior heartbeat variants so we don't double-fire.
do $$ begin perform cron.unschedule('briefing-heartbeat-5min'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('briefing-heartbeat-1min'); exception when others then null; end $$;

select cron.schedule(
  'briefing-heartbeat-1min',
  '* * * * *',
  $cron$
    select net.http_post(
      url     := 'https://dpoofcdqgmqvjyavavld.supabase.co/functions/v1/send-briefing',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer sb_publishable_Me4tGLAdCaCvnFJXVxO8ow_bguZUgBJ'
      )
    );
  $cron$
);
