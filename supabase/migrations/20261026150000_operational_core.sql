begin;

-- Application records never contain passwords. Auth identities are linked only after owner review.
create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null check (length(email) between 3 and 320 and email = lower(trim(email))),
  display_name text not null check (length(display_name) between 1 and 80),
  phone text check (phone is null or length(phone) between 6 and 30),
  status text not null default 'pending' check (status in ('pending','approved','rejected','activated')),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  invitation_hash text unique check (invitation_hash is null or invitation_hash ~ '^[0-9a-f]{64}$'),
  invitation_expires_at timestamptz,
  activated_user_id uuid unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_at is null and invitation_hash is null) or
         (status = 'rejected' and reviewed_at is not null and invitation_hash is null) or
         (status in ('approved','activated') and reviewed_at is not null and invitation_hash is not null))
);
create unique index account_requests_one_open_email on public.account_requests(email) where status in ('pending','approved','activated');
create index account_requests_status_created on public.account_requests(status, created_at desc);

alter table public.tenant_profiles add column status text not null default 'active' check (status in ('active','inactive'));
alter table public.tenant_profiles add column phone text check (phone is null or length(phone) <= 30);
alter table public.tenant_profiles add column emergency_contact text check (emergency_contact is null or length(emergency_contact) <= 160);
alter table public.tenant_profiles add column updated_at timestamptz not null default now();

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique check (length(room_number) between 1 and 32),
  floor_label text not null check (length(floor_label) between 1 and 40),
  capacity integer not null check (capacity between 1 and 100),
  availability text not null default 'available' check (availability in ('available','reserved','maintenance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  started_on date not null,
  ended_on date check (ended_on is null or ended_on >= started_on),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index room_assignments_one_active on public.room_assignments(tenant_id) where ended_on is null;
create index room_assignments_room_current on public.room_assignments(room_id) where ended_on is null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  coverage_start date not null,
  coverage_end date not null,
  due_on date not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  note text check (note is null or length(note) <= 500),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (coverage_end = (coverage_start + interval '6 months' - interval '1 day')::date),
  unique (tenant_id, coverage_start)
);
create index invoices_tenant_due on public.invoices(tenant_id, due_on desc);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references auth.users(id) on delete restrict,
  purpose text not null check (purpose in ('payment','maintenance','profile')),
  path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','application/pdf')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  created_at timestamptz not null default now(),
  check (path = uploader_id::text || '/' || id::text)
);
create index attachments_uploader on public.attachments(uploader_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('gcash','bank_transfer')),
  reference_number text not null check (length(reference_number) between 3 and 100),
  attachment_id uuid not null unique references public.attachments(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or length(review_note) between 1 and 500),
  created_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_at is null and reviewer_id is null) or
         (status <> 'pending' and reviewed_at is not null and reviewer_id is not null))
);
create unique index payments_duplicate_reference on public.payments(tenant_id, method, lower(reference_number));
create index payments_invoice on public.payments(invoice_id, created_at desc);
create index payments_status_created on public.payments(status, created_at desc);

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  tenant_id uuid references public.tenant_profiles(user_id) on delete restrict,
  room_id uuid not null references public.rooms(id) on delete restrict,
  category text not null check (length(category) between 2 and 80),
  description text not null check (length(description) between 10 and 2000),
  attachment_id uuid unique references public.attachments(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','in_progress','resolved')),
  staff_response text check (staff_response is null or length(staff_response) between 2 and 2000),
  responded_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index maintenance_requests_status_created on public.maintenance_requests(status, created_at desc);
create index maintenance_requests_tenant_created on public.maintenance_requests(tenant_id, created_at desc);

create table public.concerns (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  description text not null check (length(description) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending','resolved')),
  owner_response text check (owner_response is null or length(owner_response) between 2 and 2000),
  responded_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index concerns_tenant_created on public.concerns(tenant_id, created_at desc);

create table public.planned_visits (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  visitor_name text not null check (length(visitor_name) between 2 and 120),
  visit_on date not null,
  purpose text not null check (length(purpose) between 2 and 250),
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index planned_visits_tenant_date on public.planned_visits(tenant_id, visit_on desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(title) between 2 and 120),
  body text not null check (length(body) between 2 and 500),
  href text not null check (href ~ '^/[a-z/-]+$'),
  event_key text not null unique check (length(event_key) between 4 and 180),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_created on public.notifications(recipient_id, created_at desc);
create index notifications_recipient_unread on public.notifications(recipient_id, created_at desc) where read_at is null;

create table public.staff_profiles (
  user_id uuid primary key references mapsilip_private.accounts(user_id) on delete restrict,
  display_name text check (display_name is null or length(display_name) between 1 and 80),
  phone text check (phone is null or length(phone) <= 30),
  updated_at timestamptz not null default now()
);

create table public.operational_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null,
  record_id uuid not null,
  reason text,
  created_at timestamptz not null default now()
);
create index operational_audit_record on public.operational_audit(record_id, created_at desc);

alter table public.account_requests enable row level security;
alter table public.rooms enable row level security;
alter table public.room_assignments enable row level security;
alter table public.invoices enable row level security;
alter table public.attachments enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.concerns enable row level security;
alter table public.planned_visits enable row level security;
alter table public.notifications enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.operational_audit enable row level security;

revoke all on public.account_requests, public.rooms, public.room_assignments, public.invoices,
  public.attachments, public.payments, public.maintenance_requests, public.concerns,
  public.planned_visits, public.notifications, public.staff_profiles, public.operational_audit
  from anon, authenticated;
grant select on public.account_requests, public.rooms, public.room_assignments, public.invoices,
  public.attachments, public.payments, public.maintenance_requests, public.concerns,
  public.planned_visits, public.notifications, public.staff_profiles to authenticated;

commit;
