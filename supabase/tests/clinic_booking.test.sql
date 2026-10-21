create extension if not exists pgtap with schema extensions;
begin;
select plan(13);

select is((select count(*)::int from public.clinic_settings),0,'The project has no invented clinic configuration before the test fixture');
select ok(not has_table_privilege('anon','public.appointments','select') and not has_table_privilege('anon','public.patients','select'),'Unauthenticated API roles cannot read appointments or patient records');

insert into public.clinic_settings(id,display_name,timezone,accepts_public_bookings,min_notice_minutes,max_booking_days,slot_interval_minutes,policy_version)
values(true,'Fixture temporal','America/Lima',true,0,60,15,'test-policy');
insert into public.services(id,name,duration_minutes,buffer_minutes,is_active)
values('10000000-0000-4000-8000-000000000001','Evaluación de prueba',45,15,true);
insert into public.professionals(id,name,calendar_id,is_active)
values('20000000-0000-4000-8000-000000000001','Profesional de prueba','fixture@example.invalid',true);
insert into public.professional_services(professional_id,service_id)
values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.weekly_hours(professional_id,weekday,opens_at,closes_at)
select '20000000-0000-4000-8000-000000000001', n, '08:00', '18:00' from generate_series(0,6) as n;
insert into public.working_breaks(weekly_hours_id,starts_at,ends_at)
select id,'12:00','13:00' from public.weekly_hours where professional_id='20000000-0000-4000-8000-000000000001';
select set_config('test.booking_start', ((date_trunc('day',now() at time zone 'America/Lima')::date + 3 + time '10:00') at time zone 'America/Lima')::text, true);

select is((select count(*)::int from public.clinic_settings where id=true),1,'The clinic settings row exists only in this test transaction');
select is((select count(*)::int from public.services where id='10000000-0000-4000-8000-000000000001'),1,'Service fixture loads');
select lives_ok($$select * from public.create_booking('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_setting('test.booking_start')::timestamptz,'Paciente de prueba','999999999','test@example.invalid',true,'test-policy')$$,'A valid future booking is accepted');
select is((select count(*)::int from public.appointments where request_id='30000000-0000-4000-8000-000000000001'),1,'A valid booking persists exactly once');
select is((select booking_code from public.create_booking('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_setting('test.booking_start')::timestamptz,'Paciente de prueba','999999999','test@example.invalid',true,'test-policy')),(select booking_code from public.appointments where request_id='30000000-0000-4000-8000-000000000001'),'An idempotent retry returns its original booking code');
select throws_ok($$select * from public.create_booking('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_setting('test.booking_start')::timestamptz,'Otra persona','999999998','other@example.invalid',true,'test-policy')$$,'23P01','slot_unavailable','A second booking cannot claim an occupied interval');
select ok(not public.slot_is_open('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',(current_setting('test.booking_start')::timestamptz::date + time '12:15') at time zone 'America/Lima',null),'A slot during the configured break is closed');
insert into public.time_blocks(professional_id,starts_at,ends_at,reason)
values('20000000-0000-4000-8000-000000000001',current_setting('test.booking_start')::timestamptz + interval '4 hours',current_setting('test.booking_start')::timestamptz + interval '5 hours','fixture');
select ok(not public.slot_is_open('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',(current_setting('test.booking_start')::timestamptz + interval '4 hours'),null),'A schedule block prevents availability');
insert into public.schedule_exceptions(professional_id,exception_date,is_closed)
values(null,((current_setting('test.booking_start')::timestamptz at time zone 'America/Lima')::date + 5),true);
select ok(not public.slot_is_open('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',(current_setting('test.booking_start')::timestamptz + interval '5 days'),null),'A clinic-wide closed day overrides weekly hours');
select lives_ok($$select public.reschedule_booking((select id from public.appointments where request_id='30000000-0000-4000-8000-000000000001'),(current_setting('test.booking_start')::timestamptz + interval '1 day'))$$,'A valid appointment can be rescheduled');
select lives_ok($$select public.cancel_booking((select id from public.appointments where request_id='30000000-0000-4000-8000-000000000001'))$$,'An active appointment can be cancelled');
select * from finish();
rollback;
