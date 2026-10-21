-- Empty by design: clinic identity, professionals, services and hours must be verified.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create table public.clinic_settings (
  id boolean primary key default true check(id), display_name text not null,
  timezone text not null default 'America/Lima', accepts_public_bookings boolean not null default false,
  min_notice_minutes int not null default 1440 check(min_notice_minutes >= 0),
  max_booking_days int not null default 60 check(max_booking_days between 1 and 365),
  slot_interval_minutes int not null default 15 check(slot_interval_minutes between 5 and 120),
  policy_version text not null, updated_at timestamptz not null default now()
);
create table public.services (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
  description text not null default '' check(length(description) <= 600),
  duration_minutes int not null check(duration_minutes between 5 and 480),
  buffer_minutes int not null default 0 check(buffer_minutes between 0 and 180),
  is_active boolean not null default false, updated_at timestamptz not null default now()
);
create table public.professionals (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 120),
  credentials text not null default '', specialty text not null default '', photo_url text,
  calendar_id text not null, is_active boolean not null default false, updated_at timestamptz not null default now()
);
create table public.professional_services (
  professional_id uuid not null references public.professionals on delete cascade,
  service_id uuid not null references public.services on delete cascade,
  primary key(professional_id,service_id)
);
create table public.weekly_hours (
  id uuid primary key default gen_random_uuid(), professional_id uuid not null references public.professionals on delete cascade,
  weekday smallint not null check(weekday between 0 and 6), opens_at time not null, closes_at time not null check(opens_at < closes_at)
);
create table public.working_breaks (
  id uuid primary key default gen_random_uuid(), weekly_hours_id uuid not null references public.weekly_hours on delete cascade,
  starts_at time not null, ends_at time not null check(starts_at < ends_at)
);
create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(), professional_id uuid references public.professionals on delete cascade,
  exception_date date not null, is_closed boolean not null default true, opens_at time, closes_at time,
  note text not null default '',
  check((is_closed and opens_at is null and closes_at is null) or (not is_closed and opens_at < closes_at)),
  unique nulls not distinct(professional_id,exception_date)
);
create table public.time_blocks (
  id uuid primary key default gen_random_uuid(), professional_id uuid references public.professionals on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null check(starts_at < ends_at),
  reason text not null default '', created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
create table public.patients (
  id uuid primary key default gen_random_uuid(), full_name text not null check(length(full_name) between 2 and 120),
  phone text not null check(length(phone) between 7 and 30), email text not null check(length(email) between 6 and 254),
  privacy_consent_at timestamptz not null, policy_version text not null, created_at timestamptz not null default now()
);
create type public.appointment_status as enum('pending','confirmed','cancelled','completed','no_show','needs_review');
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique default upper(encode(extensions.gen_random_bytes(5),'hex')),
  request_id uuid not null unique, patient_id uuid not null references public.patients on delete restrict,
  service_id uuid not null references public.services on delete restrict,
  professional_id uuid not null references public.professionals on delete restrict,
  starts_at timestamptz not null, duration_minutes int not null check(duration_minutes between 5 and 480),
  buffer_minutes int not null default 0 check(buffer_minutes between 0 and 180),
  ends_at timestamptz generated always as (starts_at + make_interval(mins => duration_minutes + buffer_minutes)) stored,
  status public.appointment_status not null default 'pending', google_event_id text,
  calendar_sync_state text not null default 'queued' check(calendar_sync_state in ('queued','synced','error','conflict','cancelled')),
  calendar_sync_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint no_overlapping_active_appointments exclude using gist(
    professional_id with =, tstzrange(starts_at,ends_at,'[)') with &&
  ) where(status in ('pending','confirmed','needs_review'))
);
create index appointments_starts_idx on public.appointments(starts_at,professional_id);
create index time_blocks_range_idx on public.time_blocks using gist(tstzrange(starts_at,ends_at,'[)'));
create table public.calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments on delete cascade,
  operation text not null check(operation in ('create','update','delete')),
  state text not null default 'queued' check(state in ('queued','processing','succeeded','failed')),
  attempts int not null default 0, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments on delete cascade,
  kind text not null check(kind in ('confirmation','reminder_24h','reminder_2h','change','cancellation')),
  due_at timestamptz not null, state text not null default 'queued' check(state in ('queued','processing','sent','failed','cancelled')),
  attempts int not null default 0, provider_message_id text, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(appointment_id,kind)
);
create index notification_due_idx on public.notification_outbox(due_at) where state in ('queued','failed');
create table public.admin_users (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check(role in ('owner','admin','receptionist','dentist')),
  professional_id uuid references public.professionals on delete set null,
  is_active boolean not null default true, created_at timestamptz not null default now()
);

create or replace function public.current_clinic_role() returns text language sql stable security definer set search_path=public,auth
as $$ select role from public.admin_users where user_id=auth.uid() and is_active limit 1 $$;
create or replace function public.current_clinic_professional_id() returns uuid language sql stable security definer set search_path=public,auth
as $$ select professional_id from public.admin_users where user_id=auth.uid() and is_active limit 1 $$;
create or replace function public.is_clinic_staff() returns boolean language sql stable security definer set search_path=public,auth
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid() and is_active) $$;

create or replace function public.slot_is_open(p_service_id uuid,p_professional_id uuid,p_start timestamptz,p_ignore uuid default null)
returns boolean language plpgsql stable security definer set search_path=public,auth,extensions as $$
declare cfg public.clinic_settings%rowtype; svc public.services%rowtype; local_start timestamp; local_end timestamp;
  special public.schedule_exceptions%rowtype; open_at time; close_at time; dow int;
begin
  select * into cfg from public.clinic_settings where id=true;
  if not found or not cfg.accepts_public_bookings then return false; end if;
  select * into svc from public.services where id=p_service_id and is_active;
  if not found or not exists(select 1 from public.professionals p join public.professional_services ps on ps.professional_id=p.id
    where p.id=p_professional_id and p.is_active and ps.service_id=p_service_id) then return false; end if;
  local_start:=p_start at time zone cfg.timezone;
  local_end:=(p_start + make_interval(mins=>svc.duration_minutes+svc.buffer_minutes)) at time zone cfg.timezone;
  if local_start::date<>local_end::date or p_start<now()+make_interval(mins=>cfg.min_notice_minutes)
    or p_start>now()+make_interval(days=>cfg.max_booking_days) then return false; end if;
  select * into special from public.schedule_exceptions where exception_date=local_start::date
    and (professional_id=p_professional_id or professional_id is null) order by (professional_id is not null) desc limit 1;
  if found and special.is_closed then return false; end if;
  if found then open_at:=special.opens_at; close_at:=special.closes_at;
  else
    dow:=extract(dow from local_start)::int;
    if not exists(select 1 from public.weekly_hours h where h.professional_id=p_professional_id and h.weekday=dow
      and h.opens_at<=local_start::time and h.closes_at>=local_end::time) then return false; end if;
    if exists(select 1 from public.weekly_hours h join public.working_breaks b on b.weekly_hours_id=h.id
      where h.professional_id=p_professional_id and h.weekday=dow and b.starts_at<local_end::time and b.ends_at>local_start::time) then return false; end if;
    select min(opens_at),max(closes_at) into open_at,close_at from public.weekly_hours where professional_id=p_professional_id and weekday=dow;
  end if;
  if local_start::time<open_at or local_end::time>close_at then return false; end if;
  if exists(select 1 from public.time_blocks b where (b.professional_id=p_professional_id or b.professional_id is null)
    and b.starts_at<p_start+make_interval(mins=>svc.duration_minutes+svc.buffer_minutes) and b.ends_at>p_start) then return false; end if;
  if exists(select 1 from public.appointments a where a.professional_id=p_professional_id and a.id is distinct from p_ignore
    and a.status in ('pending','confirmed','needs_review') and a.starts_at<p_start+make_interval(mins=>svc.duration_minutes+svc.buffer_minutes)
    and a.ends_at>p_start) then return false; end if;
  return true;
end $$;

create or replace function public.create_booking(p_request_id uuid,p_service_id uuid,p_professional_id uuid,p_start timestamptz,
  p_name text,p_phone text,p_email text,p_consent boolean,p_policy_version text)
returns table(appointment_id uuid,booking_code text,status public.appointment_status)
language plpgsql security definer set search_path=public,auth,extensions as $$
declare cfg public.clinic_settings%rowtype; svc public.services%rowtype; patient uuid; appt public.appointments%rowtype;
begin
  if not p_consent then raise exception 'privacy_consent_required' using errcode='22023'; end if;
  if length(trim(p_name)) not between 2 and 120 or length(trim(p_phone)) not between 7 and 30 or length(trim(p_email)) not between 6 and 254 then
    raise exception 'invalid_contact_fields' using errcode='22023'; end if;
  select * into cfg from public.clinic_settings where id=true;
  if not found or p_policy_version is distinct from cfg.policy_version then raise exception 'policy_version_mismatch' using errcode='22023'; end if;
  select * into appt from public.appointments where request_id=p_request_id;
  if found then return query select appt.id,appt.booking_code,appt.status; return; end if;
  if not public.slot_is_open(p_service_id,p_professional_id,p_start,null) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  select * into svc from public.services where id=p_service_id and is_active;
  insert into public.patients(full_name,phone,email,privacy_consent_at,policy_version)
    values(trim(p_name),trim(p_phone),lower(trim(p_email)),now(),cfg.policy_version) returning id into patient;
  insert into public.appointments(request_id,patient_id,service_id,professional_id,starts_at,duration_minutes,buffer_minutes)
    values(p_request_id,patient,p_service_id,p_professional_id,p_start,svc.duration_minutes,svc.buffer_minutes) returning * into appt;
  insert into public.calendar_sync_jobs(appointment_id,operation) values(appt.id,'create');
  return query select appt.id,appt.booking_code,appt.status;
exception when exclusion_violation then raise exception 'slot_unavailable' using errcode='23P01';
when unique_violation then
  select * into appt from public.appointments where request_id=p_request_id;
  if found then return query select appt.id,appt.booking_code,appt.status; else raise; end if;
end $$;

create or replace function public.reschedule_booking(p_id uuid,p_start timestamptz) returns public.appointments
language plpgsql security definer set search_path=public,auth,extensions as $$
declare appt public.appointments%rowtype;
begin
  select * into appt from public.appointments where id=p_id for update;
  if not found or appt.status not in ('pending','confirmed','needs_review') then raise exception 'appointment_not_reschedulable'; end if;
  if not public.slot_is_open(appt.service_id,appt.professional_id,p_start,appt.id) then raise exception 'slot_unavailable' using errcode='23P01'; end if;
  update public.appointments set starts_at=p_start,status='pending',calendar_sync_state='queued',calendar_sync_error=null,updated_at=now()
    where id=p_id returning * into appt;
  update public.notification_outbox set due_at=greatest(now(),appt.starts_at-interval '24 hours'),state='queued',updated_at=now()
    where appointment_id=p_id and kind='reminder_24h';
  update public.notification_outbox set due_at=greatest(now(),appt.starts_at-interval '2 hours'),state='queued',updated_at=now()
    where appointment_id=p_id and kind='reminder_2h';
  insert into public.notification_outbox(appointment_id,kind,due_at) values(p_id,'change',now()) on conflict(appointment_id,kind) do update set due_at=now(),state='queued',updated_at=now();
  insert into public.calendar_sync_jobs(appointment_id,operation) values(p_id,case when appt.google_event_id is null then 'create' else 'update' end);
  return appt;
exception when exclusion_violation then raise exception 'slot_unavailable' using errcode='23P01';
end $$;

create or replace function public.cancel_booking(p_id uuid) returns public.appointments
language plpgsql security definer set search_path=public,auth as $$ declare appt public.appointments%rowtype; begin
  select * into appt from public.appointments where id=p_id for update;
  if not found or appt.status in ('cancelled','completed','no_show') then raise exception 'appointment_not_cancellable'; end if;
  update public.appointments set status='cancelled',calendar_sync_state=case when google_event_id is null then 'cancelled' else 'queued' end,updated_at=now()
    where id=p_id returning * into appt;
  update public.notification_outbox set state='cancelled',updated_at=now() where appointment_id=p_id and state in ('queued','failed');
  insert into public.notification_outbox(appointment_id,kind,due_at) values(p_id,'cancellation',now()) on conflict(appointment_id,kind) do update set due_at=now(),state='queued',updated_at=now();
  if appt.google_event_id is not null then insert into public.calendar_sync_jobs(appointment_id,operation) values(p_id,'delete'); end if;
  return appt;
end $$;

create or replace function public.mark_calendar_synced(p_id uuid,p_event_id text) returns public.appointments
language plpgsql security definer set search_path=public,auth as $$ declare appt public.appointments%rowtype; begin
  update public.appointments set google_event_id=p_event_id,calendar_sync_state='synced',calendar_sync_error=null,
    status=case when status='pending' then 'confirmed' else status end,updated_at=now() where id=p_id returning * into appt;
  if not found then raise exception 'appointment_not_found'; end if;
  update public.calendar_sync_jobs set state='succeeded',updated_at=now() where appointment_id=p_id and state in ('queued','processing');
  if appt.status='confirmed' then
    insert into public.notification_outbox(appointment_id,kind,due_at) values
      (p_id,'confirmation',now()),(p_id,'reminder_24h',greatest(now(),appt.starts_at-interval '24 hours')),
      (p_id,'reminder_2h',greatest(now(),appt.starts_at-interval '2 hours')) on conflict(appointment_id,kind) do nothing;
  end if;
  return appt;
end $$;
create or replace function public.mark_calendar_error(p_id uuid,p_message text) returns void
language plpgsql security definer set search_path=public,auth as $$ begin
  update public.appointments set calendar_sync_state='error',calendar_sync_error=left(p_message,500),updated_at=now() where id=p_id;
  update public.calendar_sync_jobs set state='failed',attempts=attempts+1,last_error=left(p_message,500),updated_at=now()
    where appointment_id=p_id and state in ('queued','processing');
end $$;

create or replace function public.admin_appointments(p_from timestamptz,p_to timestamptz,p_search text default null)
returns table(id uuid,booking_code text,status public.appointment_status,starts_at timestamptz,ends_at timestamptz,
  service_name text,professional_name text,patient_name text,patient_phone text,patient_email text,calendar_sync_state text)
language sql stable set search_path=public,auth as $$
  select a.id,a.booking_code,a.status,a.starts_at,a.ends_at,s.name,pr.name,pt.full_name,pt.phone,pt.email,a.calendar_sync_state
  from public.appointments a join public.patients pt on pt.id=a.patient_id join public.services s on s.id=a.service_id
  join public.professionals pr on pr.id=a.professional_id where public.is_clinic_staff() and a.starts_at>=p_from and a.starts_at<p_to
  and (nullif(trim(p_search),'') is null or a.booking_code ilike '%'||trim(p_search)||'%' or pt.full_name ilike '%'||trim(p_search)||'%')
  order by a.starts_at;
$$;

do $$ declare t text; begin
  foreach t in array array['clinic_settings','services','professionals','professional_services','weekly_hours','working_breaks','schedule_exceptions','time_blocks','patients','appointments','calendar_sync_jobs','notification_outbox','admin_users'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated,service_role',t);
  end loop;
end $$;

create policy settings_staff_read on public.clinic_settings for select to authenticated using(public.is_clinic_staff());
create policy settings_admin_write on public.clinic_settings for all to authenticated using(public.current_clinic_role() in ('owner','admin')) with check(public.current_clinic_role() in ('owner','admin'));
create policy services_staff_manage on public.services for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy professionals_staff_read on public.professionals for select to authenticated using(public.is_clinic_staff());
create policy professionals_admin_manage on public.professionals for all to authenticated using(public.current_clinic_role() in ('owner','admin')) with check(public.current_clinic_role() in ('owner','admin'));
create policy professional_services_manage on public.professional_services for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy weekly_hours_manage on public.weekly_hours for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy working_breaks_manage on public.working_breaks for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy exceptions_manage on public.schedule_exceptions for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy blocks_manage on public.time_blocks for all to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist')) with check(public.current_clinic_role() in ('owner','admin','receptionist'));
create policy patients_staff_read on public.patients for select to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist') or exists(
  select 1 from public.appointments a where a.patient_id=patients.id and a.professional_id=public.current_clinic_professional_id()));
create policy appointments_staff_read on public.appointments for select to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist') or professional_id=public.current_clinic_professional_id());
create policy appointments_staff_update on public.appointments for update to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist') or professional_id=public.current_clinic_professional_id()) with check(public.current_clinic_role() in ('owner','admin','receptionist') or professional_id=public.current_clinic_professional_id());
create policy owner_manage_admins on public.admin_users for all to authenticated using(public.current_clinic_role()='owner') with check(public.current_clinic_role()='owner');
create policy staff_read_sync_jobs on public.calendar_sync_jobs for select to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist') or exists(select 1 from public.appointments a where a.id=appointment_id and a.professional_id=public.current_clinic_professional_id()));
create policy staff_read_notifications on public.notification_outbox for select to authenticated using(public.current_clinic_role() in ('owner','admin','receptionist'));

grant usage on schema public to authenticated,service_role;
grant execute on function public.current_clinic_role(),public.current_clinic_professional_id(),public.is_clinic_staff(),
  public.slot_is_open(uuid,uuid,timestamptz,uuid),public.admin_appointments(timestamptz,timestamptz,text) to authenticated;
grant execute on function public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,boolean,text),
  public.reschedule_booking(uuid,timestamptz),public.cancel_booking(uuid),public.mark_calendar_synced(uuid,text),public.mark_calendar_error(uuid,text) to service_role;
revoke all on function public.create_booking(uuid,uuid,uuid,timestamptz,text,text,text,boolean,text),
  public.reschedule_booking(uuid,timestamptz),public.cancel_booking(uuid),public.mark_calendar_synced(uuid,text),public.mark_calendar_error(uuid,text) from public,anon,authenticated;
