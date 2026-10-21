import { db, errorReply, preflight, reply, requireAdmin } from '../_shared/http.ts';
import { isCalendarFree, syncAppointment } from '../_shared/google-calendar.ts';

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== 'POST') return reply(req, { error: 'method_not_allowed' }, 405);
  try {
    const client = db(); const { staff } = await requireAdmin(req, client); const input = await req.json();
    if (input.action === 'create') {
      if (!['owner','admin','receptionist'].includes(staff.role)) return reply(req, { error: 'forbidden' }, 403);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuid.test(input.request_id || '') || !uuid.test(input.service_id || '') || !uuid.test(input.professional_id || '') ||
        typeof input.starts_at !== 'string' || !Number.isFinite(Date.parse(input.starts_at)) || typeof input.name !== 'string' ||
        typeof input.phone !== 'string' || typeof input.email !== 'string' || input.privacy_consent !== true || typeof input.policy_version !== 'string') return reply(req, { error: 'invalid_request' }, 400);
      if (input.name.trim().length < 2 || input.name.length > 120 || input.phone.trim().length < 7 || input.phone.length > 30 || !/^\S+@\S+\.\S+$/.test(input.email) || input.email.length > 254) return reply(req, { error: 'invalid_contact_fields' }, 400);
      const [{ data: settings, error: settingsError }, { data: professional, error: professionalError }, { data: service, error: serviceError }] = await Promise.all([
        client.from('clinic_settings').select('timezone,policy_version,accepts_public_bookings').eq('id', true).maybeSingle(),
        client.from('professionals').select('calendar_id').eq('id', input.professional_id).eq('is_active', true).maybeSingle(),
        client.from('services').select('duration_minutes,buffer_minutes').eq('id', input.service_id).eq('is_active', true).maybeSingle(),
      ]);
      if (settingsError || professionalError || serviceError) throw settingsError || professionalError || serviceError;
      if (!settings || !professional?.calendar_id || !service) return reply(req, { error: 'booking_not_available' }, 503);
      if (input.policy_version !== settings.policy_version) return reply(req, { error: 'policy_version_mismatch' }, 409);
      const startsAt = new Date(input.starts_at).toISOString();
      const endsAt = new Date(Date.parse(startsAt) + (service.duration_minutes + service.buffer_minutes) * 60_000).toISOString();
      if (!(await isCalendarFree(professional.calendar_id, startsAt, endsAt, settings.timezone))) return reply(req, { error: 'slot_unavailable' }, 409);
      const { data: created, error: createError } = await client.rpc('create_booking', {
        p_request_id: input.request_id, p_service_id: input.service_id, p_professional_id: input.professional_id,
        p_start: startsAt, p_name: input.name.trim(), p_phone: input.phone.trim(), p_email: input.email.trim().toLowerCase(),
        p_consent: true, p_policy_version: input.policy_version,
      });
      if (createError) { if (createError.code === '23P01') return reply(req, { error: 'slot_unavailable' }, 409); throw createError; }
      const createdAppointment = Array.isArray(created) ? created[0] : created;
      try {
        await syncAppointment(client, createdAppointment.appointment_id, 'create');
        const { data: final } = await client.from('appointments').select('status').eq('id', createdAppointment.appointment_id).single();
        return reply(req, { appointment_id: createdAppointment.appointment_id, booking_code: createdAppointment.booking_code, status: final?.status || 'pending' });
      } catch (calendarError) {
        await client.rpc('mark_calendar_error', { p_id: createdAppointment.appointment_id, p_message: calendarError instanceof Error ? calendarError.message : 'calendar_sync_failed' });
        return reply(req, { appointment_id: createdAppointment.appointment_id, booking_code: createdAppointment.booking_code, status: 'pending', error: 'calendar_sync_pending' }, 202);
      }
    }
    if (!/^[0-9a-f-]{36}$/i.test(input.appointment_id || '')) return reply(req, { error: 'invalid_appointment_id' }, 400);
    const { data: appointment, error: appointmentError } = await client.from('appointments').select('service_id,professional_id,status').eq('id', input.appointment_id).maybeSingle();
    if (appointmentError) throw appointmentError;
    if (!appointment) return reply(req, { error: 'appointment_not_found' }, 404);
    if (staff.role === 'dentist' && appointment.professional_id !== staff.professional_id) return reply(req, { error: 'forbidden' }, 403);
    let operation: 'create' | 'update' | 'delete' | undefined;
    if (input.action === 'cancel') {
      const { error } = await client.rpc('cancel_booking', { p_id: input.appointment_id }); if (error) throw error;
      operation = 'delete';
    } else if (input.action === 'reschedule') {
      if (typeof input.starts_at !== 'string' || !Number.isFinite(Date.parse(input.starts_at))) return reply(req, { error: 'invalid_start_time' }, 400);
      const { data: ok, error: checkError } = await client.rpc('slot_is_open', { p_service_id: appointment.service_id, p_professional_id: appointment.professional_id, p_start: input.starts_at, p_ignore: input.appointment_id });
      if (checkError) throw checkError;
      if (!ok) return reply(req, { error: 'slot_unavailable' }, 409);
      const { error } = await client.rpc('reschedule_booking', { p_id: input.appointment_id, p_start: input.starts_at }); if (error) throw error;
      operation = 'update';
    } else if (input.action === 'retry') {
      const { data: appt, error } = await client.from('appointments').select('status').eq('id', input.appointment_id).single(); if (error) throw error;
      operation = appt.status === 'cancelled' ? 'delete' : undefined;
    } else return reply(req, { error: 'invalid_action' }, 400);
    try { const result = await syncAppointment(client, input.appointment_id, operation); return reply(req, { ok: true, ...result }); }
    catch (error) {
      await client.rpc('mark_calendar_error', { p_id: input.appointment_id, p_message: error instanceof Error ? error.message : 'calendar_sync_failed' });
      return reply(req, { error: 'calendar_sync_failed', retryable: true }, 502);
    }
  } catch (error) { return errorReply(req, error); }
});
