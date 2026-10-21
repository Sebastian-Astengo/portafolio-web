import { db, reply } from '../_shared/http.ts';

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!); }
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Headers': 'x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (req.method !== 'POST' || !Deno.env.get('CRON_SECRET') || req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return reply(req, { error: 'unauthorized' }, 401);
  const apiKey = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('RESEND_FROM');
  if (!apiKey || !from) return reply(req, { error: 'email_provider_not_configured' }, 503);
  try {
    const client = db();
    const { data: jobs, error } = await client.from('notification_outbox').select('id,appointment_id,kind,attempts,appointment:appointments(booking_code,starts_at,status,service:services(name),professional:professionals(name),patient:patients(full_name,email))').in('state', ['queued', 'failed']).lte('due_at', new Date().toISOString()).lt('attempts', 5).order('due_at').limit(25);
    if (error) throw error;
    let sent = 0; let failed = 0;
    for (const job of jobs || []) {
      const { data: claimed } = await client.from('notification_outbox').update({ state: 'processing', attempts: job.attempts + 1, updated_at: new Date().toISOString() }).eq('id', job.id).in('state', ['queued', 'failed']).select('id').maybeSingle();
      if (!claimed) continue;
      const appt = job.appointment as any; const patient = appt?.patient;
      if (!patient?.email || (appt.status === 'cancelled' && job.kind !== 'cancellation')) { await client.from('notification_outbox').update({ state: 'cancelled', updated_at: new Date().toISOString() }).eq('id', job.id); continue; }
      if (appt.status !== 'confirmed' && job.kind !== 'cancellation') { await client.from('notification_outbox').update({ state: 'queued', due_at: new Date(Date.now() + 5 * 60_000).toISOString(), updated_at: new Date().toISOString() }).eq('id', job.id); continue; }
      const date = new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: Deno.env.get('CLINIC_TIMEZONE') || 'America/Lima' }).format(new Date(appt.starts_at));
      const heading = job.kind.startsWith('reminder') ? 'Recordatorio de tu cita' : job.kind === 'cancellation' ? 'Tu cita fue cancelada' : job.kind === 'change' ? 'Tu cita fue reprogramada' : 'Tu cita está confirmada';
      const html = `<p>Hola ${escapeHtml(patient.full_name)},</p><p>${heading}.</p><p><strong>${escapeHtml(appt.service?.name || 'Consulta')}</strong><br>${escapeHtml(date)}<br>Profesional: ${escapeHtml(appt.professional?.name || 'Equipo clínico')}</p><p>Código: ${escapeHtml(appt.booking_code)}</p><p>Si necesitas hacer un cambio, comunícate directamente con la clínica.</p>`;
      try {
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `clinic-${job.id}` }, body: JSON.stringify({ from, to: [patient.email], subject: heading, html }) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`email_provider_${response.status}`);
        await client.from('notification_outbox').update({ state: 'sent', provider_message_id: result.id || null, last_error: null, updated_at: new Date().toISOString() }).eq('id', job.id); sent++;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : 'email_send_failed';
        await client.from('notification_outbox').update({ state: 'failed', last_error: message.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', job.id); failed++;
      }
    }
    return reply(req, { processed: sent + failed, sent, failed });
  } catch { return reply(req, { error: 'notification_job_failed' }, 500); }
});
