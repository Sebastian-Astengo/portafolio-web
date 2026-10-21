import { db, errorReply, preflight, reply } from '../_shared/http.ts';
import { isCalendarFree, syncAppointment } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== 'POST') return reply(req, { error: 'method_not_allowed' }, 405);
  try {
    const input = await req.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(input.request_id || '') || !uuid.test(input.service_id || '') || !uuid.test(input.professional_id || '') ||
      typeof input.starts_at !== 'string' || !Number.isFinite(Date.parse(input.starts_at)) || typeof input.name !== 'string' ||
      typeof input.phone !== 'string' || typeof input.email !== 'string' || input.privacy_consent !== true || typeof input.policy_version !== 'string') {
      return reply(req, { error: 'invalid_request' }, 400);
    }
    if (input.name.trim().length < 2 || input.name.length > 120 || input.phone.trim().length < 7 || input.phone.length > 30 || !/^\S+@\S+\.\S+$/.test(input.email) || input.email.length > 254) return reply(req, { error: 'invalid_contact_fields' }, 400);
    const client = db();
    const { data: prior, error: priorError } = await client.from('appointments').select('id,booking_code,status').eq('request_id', input.request_id).maybeSingle();
    if (priorError) throw priorError;
    if (prior) return reply(req, { appointment_id: prior.id, booking_code: prior.booking_code, status: prior.status });
    const [{ data: settings, error: settingsError }, { data: professional, error: professionalError }, { data: service, error: serviceError }] = await Promise.all([
      client.from('clinic_settings').select('timezone,policy_version,accepts_public_bookings').eq('id', true).maybeSingle(),
      client.from('professionals').select('calendar_id').eq('id', input.professional_id).eq('is_active', true).maybeSingle(),
      client.from('services').select('duration_minutes,buffer_minutes').eq('id', input.service_id).eq('is_active', true).maybeSingle(),
    ]);
    if (settingsError || professionalError || serviceError) throw settingsError || professionalError || serviceError;
    if (!settings?.accepts_public_bookings) return reply(req, { error: 'booking_not_available' }, 503);
    if (!professional || !service) return reply(req, { error: 'invalid_service_or_professional' }, 400);
    if (input.policy_version !== settings.policy_version) return reply(req, { error: 'policy_version_mismatch' }, 409);
    if (!professional.calendar_id || !Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) return reply(req, { error: 'booking_integrations_not_configured' }, 503);
    const startsAt = new Date(input.starts_at).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + (service.duration_minutes + service.buffer_minutes) * 60_000).toISOString();
    if (!(await isCalendarFree(professional.calendar_id, startsAt, endsAt, settings.timezone))) return reply(req, { error: 'slot_unavailable' }, 409);
    const { data: created, error } = await client.rpc('create_booking', {
      p_request_id: input.request_id, p_service_id: input.service_id, p_professional_id: input.professional_id,
      p_start: startsAt, p_name: input.name.trim(), p_phone: input.phone.trim(), p_email: input.email.trim().toLowerCase(),
      p_consent: true, p_policy_version: input.policy_version,
    });
    if (error) {
      if (error.message?.includes('slot_unavailable') || error.code === '23P01') return reply(req, { error: 'slot_unavailable' }, 409);
      throw error;
    }
    const appointment = Array.isArray(created) ? created[0] : created;
    try {
      await syncAppointment(client, appointment.appointment_id, 'create');
      const { data: final } = await client.from('appointments').select('status').eq('id', appointment.appointment_id).single();
      return reply(req, { appointment_id: appointment.appointment_id, booking_code: appointment.booking_code, status: final?.status || 'pending' });
    } catch (calendarError) {
      const message = calendarError instanceof Error ? calendarError.message : 'calendar_sync_failed';
      await client.rpc('mark_calendar_error', { p_id: appointment.appointment_id, p_message: message });
      return reply(req, { appointment_id: appointment.appointment_id, booking_code: appointment.booking_code, status: 'pending', message: 'calendar_confirmation_pending' }, 202);
    }
  } catch (error) { return errorReply(req, error); }
});
