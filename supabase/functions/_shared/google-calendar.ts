import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5.9.6';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy';
type Busy = { start: string; end: string };
let cachedToken: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('google_calendar_not_configured');
  const account = JSON.parse(raw);
  if (!account.client_email || !account.private_key) throw new Error('invalid_google_service_account');
  const key = await importPKCS8(account.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuer(account.client_email)
    .setAudience(account.token_uri || 'https://oauth2.googleapis.com/token')
    .setIssuedAt().setExpirationTime('55m').sign(key);
  const response = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error('google_token_exchange_failed');
  cachedToken = { value: payload.access_token, expires: Date.now() + Number(payload.expires_in || 3300) * 1000 };
  return payload.access_token;
}

async function google(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`google_calendar_${response.status}`);
  return body;
}

export async function freeBusy(calendarIds: string[], startsAt: string, endsAt: string, timezone = 'America/Lima'): Promise<Record<string, { busy?: Busy[]; errors?: unknown[] }>> {
  if (!calendarIds.length) throw new Error('google_calendar_not_configured');
  const body = await google('freeBusy', {
    method: 'POST', body: JSON.stringify({ timeMin: startsAt, timeMax: endsAt, timeZone: timezone, items: calendarIds.map((id) => ({ id })) }),
  });
  return (body.calendars || {}) as Record<string, { busy?: Busy[]; errors?: unknown[] }>;
}

function calendarPath(calendarId: string, tail = '') {
  return `calendars/${encodeURIComponent(calendarId)}/events${tail}`;
}

async function existingEvent(calendarId: string, bookingId: string, startsAt: string, endsAt: string) {
  const query = new URLSearchParams({
    privateExtendedProperty: `booking_id=${bookingId}`, timeMin: startsAt, timeMax: endsAt,
    singleEvents: 'true', maxResults: '5', showDeleted: 'false',
  });
  const result = await google(`${calendarPath(calendarId)}?${query}`);
  return result.items?.find((event: { status?: string }) => event.status !== 'cancelled') || null;
}

export async function isCalendarFree(calendarId: string, startsAt: string, endsAt: string, timezone = 'America/Lima', ignoreEventId?: string) {
  const response = await freeBusy([calendarId], startsAt, endsAt, timezone);
  const calendar = response[calendarId];
  if (!calendar || calendar.errors?.length) throw new Error('google_calendar_busy_check_failed');
  const overlaps = (calendar.busy || []).some((slot) => Date.parse(slot.start) < Date.parse(endsAt) && Date.parse(slot.end) > Date.parse(startsAt));
  if (!overlaps) return true;
  if (!ignoreEventId) return false;
  const query = new URLSearchParams({ timeMin: startsAt, timeMax: endsAt, singleEvents: 'true', showDeleted: 'false', maxResults: '250' });
  const result = await google(`${calendarPath(calendarId)}?${query}`);
  const otherOverlap = (result.items || []).some((event: { id: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }) => {
    if (event.id === ignoreEventId || event.status === 'cancelled') return false;
    const eventStart = Date.parse(event.start?.dateTime || `${event.start?.date}T00:00:00Z`);
    const eventEnd = Date.parse(event.end?.dateTime || `${event.end?.date}T23:59:59Z`);
    return eventStart < Date.parse(endsAt) && eventEnd > Date.parse(startsAt);
  });
  return !otherOverlap;
}

export async function syncAppointment(client: SupabaseClient, appointmentId: string, operation?: 'create' | 'update' | 'delete') {
  const { data: rawAppointment, error } = await client.from('appointments')
    .select('id,booking_code,status,starts_at,ends_at,google_event_id,calendar_sync_state,service:services(name),professional:professionals(name,calendar_id),patient:patients(full_name,email)')
    .eq('id', appointmentId).single();
  if (error || !rawAppointment) throw new Error('appointment_not_found');
  const appointment = rawAppointment as unknown as {
    id: string; booking_code: string; status: string; starts_at: string; ends_at: string; google_event_id: string | null;
    service: { name: string } | { name: string }[] | null;
    professional: { name: string; calendar_id: string } | { name: string; calendar_id: string }[] | null;
  };
  const professional = Array.isArray(appointment.professional) ? appointment.professional[0] : appointment.professional;
  const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service;
  const calendarId = professional?.calendar_id;
  if (!calendarId) throw new Error('professional_calendar_not_configured');
  const currentOperation = operation || (appointment.status === 'cancelled' ? 'delete' : appointment.google_event_id ? 'update' : 'create');
  const start = new Date(appointment.starts_at).toISOString();
  const end = new Date(appointment.ends_at).toISOString();
  const existing = appointment.google_event_id ? { id: appointment.google_event_id } : await existingEvent(calendarId, appointment.id, start, end);

  if (currentOperation === 'delete' || appointment.status === 'cancelled') {
    if (existing?.id) await google(calendarPath(calendarId, `/${encodeURIComponent(existing.id)}`), { method: 'DELETE' });
    const { error: updateError } = await client.from('appointments').update({ calendar_sync_state: 'cancelled', calendar_sync_error: null }).eq('id', appointmentId);
    if (updateError) throw updateError;
    await client.from('calendar_sync_jobs').update({ state: 'succeeded', updated_at: new Date().toISOString() }).eq('appointment_id', appointmentId).in('state', ['queued', 'processing']);
    return { operation: 'delete', event_id: existing?.id || null };
  }

  const isMovingExisting = Boolean(existing?.id);
  if (!(await isCalendarFree(calendarId, start, end, 'America/Lima', isMovingExisting ? existing?.id : undefined))) throw new Error('calendar_conflict');
  const settings = await client.from('clinic_settings').select('display_name,timezone').eq('id', true).single();
  if (settings.error) throw new Error('clinic_settings_missing');
  const serviceName = service?.name || 'Consulta';
  const event = {
    summary: `${serviceName} · ${settings.data.display_name}`,
    description: `Código de reserva: ${appointment.booking_code}`,
    start: { dateTime: start, timeZone: settings.data.timezone },
    end: { dateTime: end, timeZone: settings.data.timezone },
    visibility: 'private', transparency: 'opaque',
    extendedProperties: { private: { booking_id: appointment.id, booking_code: appointment.booking_code } },
  };
  const result = existing?.id
    ? await google(calendarPath(calendarId, `/${encodeURIComponent(existing.id)}`), { method: 'PATCH', body: JSON.stringify(event) })
    : await google(calendarPath(calendarId), { method: 'POST', body: JSON.stringify(event) });
  const { error: markError } = await client.rpc('mark_calendar_synced', { p_id: appointmentId, p_event_id: result.id });
  if (markError) throw new Error('calendar_event_saved_but_database_update_failed');
  return { operation: currentOperation, event_id: result.id };
}
