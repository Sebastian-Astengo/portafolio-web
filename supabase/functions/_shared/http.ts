import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()).filter(Boolean);
export function cors(req: Request): HeadersInit {
  const origin = req.headers.get('origin') || '';
  const permitted = allowedOrigins.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    ...(permitted ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
export function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: cors(req) }) : null;
}
export function db() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('backend_not_configured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireAdmin(req: Request, client = db()) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('unauthorized');
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) throw new Error('unauthorized');
  const { data: staff } = await client.from('admin_users').select('role,professional_id,is_active').eq('user_id', user.id).eq('is_active', true).maybeSingle();
  if (!staff) throw new Error('forbidden');
  return { user, staff, client };
}
export function errorReply(req: Request, error: unknown): Response {
  const raw = error instanceof Error ? error.message : '';
  const allowed = new Set(['unauthorized','forbidden','slot_unavailable','backend_not_configured','appointment_not_found','policy_version_mismatch','invalid_request','invalid_date','invalid_contact_fields','appointment_not_reschedulable','appointment_not_cancellable']);
  const message = allowed.has(raw) ? raw : /^(google_|invalid_google_|professional_calendar_|calendar_)/.test(raw) ? 'calendar_unavailable' : 'unexpected_error';
  const status = message === 'unauthorized' ? 401 : message === 'forbidden' ? 403 : message === 'slot_unavailable' || message === 'policy_version_mismatch' ? 409 : message === 'appointment_not_found' ? 404 : message === 'backend_not_configured' || message === 'calendar_unavailable' ? 503 : message === 'unexpected_error' ? 500 : 400;
  return reply(req, { error: message }, status);
}
