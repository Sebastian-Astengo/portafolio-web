const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','CLINIC_TEST_SERVICE_ID','CLINIC_TEST_PROFESSIONAL_ID','CLINIC_TEST_STARTS_AT','CLINIC_TEST_POLICY_VERSION'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}; use only an isolated local test project.`);
const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const headers = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
const requests = [crypto.randomUUID(), crypto.randomUUID()];
const booking = (requestId, name, phone, email) => fetch(`${base}/rest/v1/rpc/create_booking`, { method: 'POST', headers, body: JSON.stringify({
  p_request_id: requestId, p_service_id: process.env.CLINIC_TEST_SERVICE_ID, p_professional_id: process.env.CLINIC_TEST_PROFESSIONAL_ID,
  p_start: process.env.CLINIC_TEST_STARTS_AT, p_name: name, p_phone: phone, p_email: email,
  p_consent: true, p_policy_version: process.env.CLINIC_TEST_POLICY_VERSION,
}) });
let results = [];
try {
  results = await Promise.all([
    booking(requests[0], 'Concurrency fixture A', '999999991', 'race-a@example.invalid'),
    booking(requests[1], 'Concurrency fixture B', '999999992', 'race-b@example.invalid'),
  ]);
  const outcomes = await Promise.all(results.map(async (response) => ({ status: response.status, body: await response.json() })));
  const winners = outcomes.filter((item) => item.status === 200);
  const losers = outcomes.filter((item) => item.status === 409 || item.body?.code === '23P01');
  if (winners.length !== 1 || losers.length !== 1) throw new Error(`Expected exactly one accepted booking and one conflict; got ${JSON.stringify(outcomes)}`);
  console.log('PASS: simultaneous requests for one professional/time produced one booking and one conflict.');
} finally {
  const filter = encodeURIComponent(`(${requests.join(',')})`);
  const found = await fetch(`${base}/rest/v1/appointments?select=id,patient_id&request_id=in.${filter}`, { headers });
  if (found.ok) {
    const rows = await found.json();
    for (const row of rows) {
      await fetch(`${base}/rest/v1/appointments?id=eq.${row.id}`, { method: 'DELETE', headers });
      await fetch(`${base}/rest/v1/patients?id=eq.${row.patient_id}`, { method: 'DELETE', headers });
    }
  }
}
