-- Daily-brief dedup marker.
-- Records the last schedule SLOT (WIB date + configured briefing_time) the daily
-- brief was sent for, e.g. "2026-06-23T06:25". The send-briefing function fires
-- once per slot rather than once per day: changing briefing_time yields a new
-- slot, so the brief can run again the same day at the new time, while repeated
-- heartbeats for the same slot are deduped.
alter table app_settings add column if not exists last_daily_slot text;
