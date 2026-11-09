-- Drops `notification_preferences` (created in 0012_settings.sql alongside app_settings, which
-- was already dropped in 0021). Confirmed dead: no route, service, or component ever reads or
-- writes email_digests/new_generation_alert/system_updates — the real notifications feature
-- (0024_notifications.sql) has no per-user preference/opt-out UI, it's all-or-nothing.
drop table if exists notification_preferences cascade;
