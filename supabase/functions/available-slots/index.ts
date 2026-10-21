import { db, errorReply, preflight, reply } from '../_shared/http.ts';
import { freeBusy } from '../_shared/google-calendar.ts';

function atClinicTime(date: string, minutes: number, timezone: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const hour = Math.floor(minutes / 60); const minute = minutes % 60;
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(wanted));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
  return new Date(wanted - (represented - wanted)).toISOString();
}

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== 'POST') return reply(req, { error: 'method_not_allowed' }, 405);
  try {
    const input = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') || !/^[0-9a-f-]{36}$/i.test(input.service_id || '') || (input.professional_id && !/^[0-9a-f-]{36}$/i.test(input.professional_id))) return reply(req, { error: 'invalid_request' }, 400);
    const client = db();
    const { data: cfg, error: cfgError } = await client.from('clinic_settings').select('*').eq('id', true).maybeSingle();
    if (cfgError) throw cfgError;
    if (!cfg || !cfg.accepts_public_bookings) return reply(req, { slots: [], message: 'booking_not_available' });
    const date = new Date(`${input.date}T12:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== input.date) return reply(req, { error: 'invalid_date' }, 400);
    const horizon = new Date(); horizon.setUTCDate(horizon.getUTCDate() + cfg.max_booking_days + 1);
    if (input.date < new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) || date > horizon) return reply(req, { slots: [] });
    const query = client.from('professionals').select('id,name,calendar_id,professional_services!inner(service_id)').eq('is_active', true).eq('professional_services.service_id', input.service_id);
    if (input.professional_id) query.eq('id', input.professional_id);
    const { data: pros, error: proError } = await query;
    if (proError) throw proError;
    const { data: service, error: serviceError } = await client.from('services').select('duration_minutes,buffer_minutes').eq('id', input.service_id).eq('is_active', true).maybeSingle();
    if (serviceError) throw serviceError;
    if (!service) return reply(req, { slots: [] });
    const startDay = atClinicTime(input.date, 0, cfg.timezone); const endDay = atClinicTime(input.date, 1440, cfg.timezone);
    const calendars = (pros || []).filter((pro) => pro.calendar_id);
    if (calendars.length !== (pros || []).length) throw new Error('professional_calendar_not_configured');
    const busyByCalendar = await freeBusy(calendars.map((pro) => pro.calendar_id), startDay, endDay, cfg.timezone);
    const slots: Array<{ starts_at: string; professional_id: string; professional_name: string }> = [];
    for (const professional of calendars) {
      const busy = busyByCalendar[professional.calendar_id];
      if (!busy || busy.errors?.length) throw new Error('google_calendar_busy_check_failed');
      for (let minute = 0; minute < 1440; minute += cfg.slot_interval_minutes) {
        const startsAt = atClinicTime(input.date, minute, cfg.timezone);
        const endsAt = new Date(Date.parse(startsAt) + (service.duration_minutes + service.buffer_minutes) * 60_000).toISOString();
        if ((busy.busy || []).some((entry) => Date.parse(entry.start) < Date.parse(endsAt) && Date.parse(entry.end) > Date.parse(startsAt))) continue;
        const { data: open, error } = await client.rpc('slot_is_open', { p_service_id: input.service_id, p_professional_id: professional.id, p_start: startsAt, p_ignore: null });
        if (error) throw error;
        if (open) slots.push({ starts_at: startsAt, professional_id: professional.id, professional_name: professional.name });
      }
    }
    slots.sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
    return reply(req, { slots });
  } catch (error) { return errorReply(req, error); }
});
