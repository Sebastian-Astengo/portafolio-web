import { db, errorReply, preflight, reply } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const options = preflight(req); if (options) return options;
  if (req.method !== 'POST') return reply(req, { error: 'method_not_allowed' }, 405);
  try {
    const client = db();
    const { data: settings, error: settingsError } = await client.from('clinic_settings')
      .select('display_name,timezone,policy_version,accepts_public_bookings').eq('id', true).maybeSingle();
    if (settingsError) throw settingsError;
    if (!settings) return reply(req, { clinic: null, services: [], professionals: [] });
    const [{ data: services, error: servicesError }, { data: professionals, error: professionalsError }, { data: links, error: linksError }] = await Promise.all([
      client.from('services').select('id,name,description,duration_minutes').eq('is_active', true).order('name'),
      client.from('professionals').select('id,name,credentials,specialty,photo_url,calendar_id').eq('is_active', true).order('name'),
      client.from('professional_services').select('professional_id,service_id'),
    ]);
    if (servicesError || professionalsError || linksError) throw servicesError || professionalsError || linksError;
    const visibleProfessionals = (professionals || []).filter((p) => Boolean(p.calendar_id)).map(({ calendar_id: _calendar, ...p }) => p);
    const allowed = new Set(visibleProfessionals.map((p) => p.id));
    return reply(req, {
      clinic: { name: settings.display_name, timezone: settings.timezone, policy_version: settings.policy_version, bookings_open: settings.accepts_public_bookings },
      services: (services || []).map((service) => ({ ...service, professional_ids: (links || []).filter((link) => link.service_id === service.id && allowed.has(link.professional_id)).map((link) => link.professional_id) })).filter((service) => service.professional_ids.length),
      professionals: visibleProfessionals,
    });
  } catch (error) { return errorReply(req, error); }
});
