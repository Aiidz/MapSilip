begin;

alter table mapsilip_backup.schedule_settings
  rename column monthly_enabled to enabled;
alter table mapsilip_backup.schedule_settings
  add column frequency text not null default 'monthly' check (frequency in ('weekly','monthly','yearly')),
  add column weekday integer not null default 1 check (weekday between 0 and 6),
  add column month_day integer not null default 1 check (month_day between 1 and 31),
  add column year_month integer not null default 1 check (year_month between 1 and 12),
  add column local_time time(0) not null default '00:00' check (local_time < time '24:00'),
  add column next_run_at timestamptz;

-- Preserve eligibility for the current dispatch window of already enabled schedules.
update mapsilip_backup.schedule_settings set next_run_at =
  date_trunc('month',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila' where enabled;
alter table mapsilip_backup.schedule_settings add check (enabled = (next_run_at is not null));
alter table mapsilip_backup.jobs drop constraint jobs_reason_check,
  add check (reason in ('manual','weekly','monthly','yearly'));
create index backup_schedule_due on mapsilip_backup.schedule_settings(next_run_at) where enabled;
commit;
