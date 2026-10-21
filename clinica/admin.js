import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const config = window.CLINICA_CONFIG || {};
const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || '') && Boolean(config.supabaseAnonKey);
const status = document.querySelector('#admin-status');
const loginForm = document.querySelector('#login-form');
const agenda = document.querySelector('#agenda');
const rows = document.querySelector('#appointment-list');
const notice = document.querySelector('#agenda-notice');
const dateInput = document.querySelector('#agenda-date');
const searchInput = document.querySelector('#agenda-search');
const dialog = document.querySelector('#reschedule-dialog');
const manualDialog = document.querySelector('#manual-dialog');
const manualForm = document.querySelector('#manual-form');
const manualService = document.querySelector('#manual-service');
const manualProfessional = document.querySelector('#manual-professional');
let supabase; let period = 'day'; let selectedAppointment = null;

function localDay(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone || 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function localBoundary(day) { return new Date(`${day}T00:00:00-05:00`); }
function shiftedDay(day, amount) { const value = new Date(`${day}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + amount); return value.toISOString().slice(0, 10); }
function announce(message, isError = false) { notice.textContent = message; notice.dataset.kind = isError ? 'error' : ''; }
async function edge(action, appointmentId, startsAt) {
  return postEdge({ action, appointment_id: appointmentId, ...(startsAt ? { starts_at: startsAt } : {}) });
}
async function postEdge(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Tu sesión terminó. Inicia sesión de nuevo.');
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar-sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo actualizar la cita.');
  return result;
}
async function loadManualOptions() {
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/public-catalog`, { method: 'POST', headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, 'Content-Type': 'application/json' }, body: '{}' });
  const catalog = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('No se pudieron cargar los servicios configurados.');
  const services = catalog.services || []; const professionals = catalog.professionals || [];
  manualService.replaceChildren(new Option('Selecciona una atención', ''), ...services.map((item) => new Option(item.name, item.id)));
  manualService.disabled = services.length === 0;
  manualService.onchange = () => {
    const service = services.find((item) => item.id === manualService.value);
    const allowed = professionals.filter((item) => service?.professional_ids.includes(item.id));
    manualProfessional.replaceChildren(new Option('Selecciona profesional', ''), ...allowed.map((item) => new Option(item.name, item.id)));
    manualProfessional.disabled = allowed.length === 0;
  };
  manualProfessional.disabled = true;
}
async function updateRoleControls() {
  const { data: role, error } = await supabase.rpc('current_clinic_role');
  document.querySelector('#show-manual').hidden = Boolean(error) || !['owner','admin','receptionist'].includes(role);
  if (!error && ['owner','admin','receptionist'].includes(role)) await loadManualOptions();
}
function dateRange(day) {
  let from = day; let to;
  if (period === 'day') to = shiftedDay(day, 1);
  else if (period === 'week') { const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); from = shiftedDay(day, -((weekday + 6) % 7)); to = shiftedDay(from, 7); }
  else { from = `${day.slice(0, 7)}-01`; const firstNext = new Date(`${from}T12:00:00Z`); firstNext.setUTCMonth(firstNext.getUTCMonth() + 1); to = firstNext.toISOString().slice(0, 10); }
  return [localBoundary(from).toISOString(), localBoundary(to).toISOString()];
}
function formatDate(value) { return new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone: config.timezone || 'America/Lima' }).format(new Date(value)); }
function makeButton(label, action, disabled = false) { const button = document.createElement('button'); button.type = 'button'; button.className = 'admin-action'; button.textContent = label; button.disabled = disabled; button.dataset.action = action; return button; }
function render(appointments) {
  rows.replaceChildren();
  if (!appointments.length) { const empty = document.createElement('p'); empty.className = 'empty-agenda'; empty.textContent = 'No hay citas en este periodo.'; rows.append(empty); return; }
  appointments.forEach((item) => {
    const card = document.createElement('article'); card.className = 'appointment-card';
    const top = document.createElement('div'); top.className = 'appointment-card-top';
    const heading = document.createElement('h2'); heading.textContent = `${item.service_name} · ${formatDate(item.starts_at)}`;
    const code = document.createElement('span'); code.className = 'appointment-code'; code.textContent = item.booking_code;
    top.append(heading, code);
    const detail = document.createElement('p'); detail.textContent = `${item.patient_name} · ${item.patient_phone} · ${item.patient_email}`;
    const staff = document.createElement('p'); staff.textContent = `Profesional: ${item.professional_name} · Estado: ${item.status} · Calendario: ${item.calendar_sync_state}`;
    const actions = document.createElement('div'); actions.className = 'appointment-actions';
    if (!['cancelled', 'completed', 'no_show'].includes(item.status)) {
      actions.append(makeButton('Reprogramar', 'reschedule'), makeButton('Cancelar cita', 'cancel'));
    }
    if (item.calendar_sync_state === 'error' || item.calendar_sync_state === 'queued') actions.append(makeButton('Reintentar calendario', 'retry'));
    actions.dataset.id = item.id;
    card.append(top, detail, staff, actions); rows.append(card);
  });
}
async function loadAppointments() {
  if (!supabase) return;
  announce('Cargando agenda…');
  const [from, to] = dateRange(dateInput.value || localDay(new Date()));
  const { data, error } = await supabase.rpc('admin_appointments', { p_from: from, p_to: to, p_search: searchInput.value.trim() || null });
  if (error) { announce('No se pudo cargar la agenda. Revisa los permisos del usuario.', true); return; }
  render(data || []); announce(`${(data || []).length} cita${(data || []).length === 1 ? '' : 's'} en este periodo.`);
}

if (!ready) {
  status.textContent = 'El panel espera la configuración del proyecto Supabase. No se puede iniciar sesión todavía.';
  loginForm.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
} else {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { persistSession: true, storage: window.sessionStorage, autoRefreshToken: true } });
  status.textContent = 'Inicia sesión con una cuenta que la clínica haya autorizado.';
  dateInput.value = localDay(new Date());
  supabase.auth.onAuthStateChange((_event, session) => {
    loginForm.hidden = Boolean(session); agenda.hidden = !session;
    if (session) { status.textContent = 'Sesión autenticada. La autorización de agenda se comprueba en el servidor.'; void loadAppointments(); void updateRoleControls(); }
  });
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!supabase) return;
  status.textContent = 'Verificando acceso…';
  const { error } = await supabase.auth.signInWithPassword({ email: document.querySelector('#login-email').value.trim(), password: document.querySelector('#login-password').value });
  status.textContent = error ? 'No se pudo iniciar sesión. Revisa tus credenciales y el acceso autorizado.' : 'Acceso comprobado.';
});
document.querySelectorAll('[data-period]').forEach((button) => button.addEventListener('click', () => {
  period = button.dataset.period;
  document.querySelectorAll('[data-period]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  void loadAppointments();
}));
dateInput.addEventListener('change', () => void loadAppointments());
let searchTimer;
searchInput.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => void loadAppointments(), 250); });
rows.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const wrapper = button.closest('.appointment-actions'); selectedAppointment = wrapper.dataset.id;
  try {
    if (button.dataset.action === 'reschedule') {
      document.querySelector('#reschedule-start').value = '';
      dialog.showModal(); return;
    }
    if (button.dataset.action === 'cancel' && !window.confirm('¿Cancelar esta cita?')) return;
    button.disabled = true;
    await edge(button.dataset.action, selectedAppointment);
    announce(button.dataset.action === 'cancel' ? 'Cita cancelada. La eliminación del evento se ha sincronizado.' : 'Sincronización completada.');
    await loadAppointments();
  } catch (error) { announce(error.message, true); button.disabled = false; }
});
document.querySelector('#reschedule-form').addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const button = document.querySelector('#save-reschedule'); button.disabled = true;
  try {
    const value = document.querySelector('#reschedule-start').value;
    const offsetLocal = new Date(`${value}:00-05:00`).toISOString();
    await edge('reschedule', selectedAppointment, offsetLocal);
    dialog.close(); announce('La cita se reprogramó y el calendario se actualizó.'); await loadAppointments();
  } catch (error) { announce(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector('#show-manual').addEventListener('click', () => {
  manualForm.reset(); manualProfessional.replaceChildren(new Option('Selecciona una atención primero', '')); manualProfessional.disabled = true; manualDialog.showModal();
});
manualForm.addEventListener('submit', async (event) => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault(); if (!manualForm.reportValidity()) return;
  const button = document.querySelector('#save-manual'); button.disabled = true;
  try {
    const localStart = document.querySelector('#manual-start').value;
    const startsAt = new Date(`${localStart}:00-05:00`).toISOString();
    const result = await postEdge({ action: 'create', request_id: crypto.randomUUID(), service_id: manualService.value,
      professional_id: manualProfessional.value, starts_at: startsAt, name: document.querySelector('#manual-name').value.trim(),
      phone: document.querySelector('#manual-phone').value.trim(), email: document.querySelector('#manual-email').value.trim(),
      privacy_consent: document.querySelector('#manual-consent').checked, policy_version: config.policyVersion });
    manualDialog.close(); announce(result.status === 'confirmed' ? `Cita creada y confirmada · ${result.booking_code}` : `Cita registrada, pendiente de sincronización · ${result.booking_code}`); await loadAppointments();
  } catch (error) { announce(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector('#logout').addEventListener('click', async () => { await supabase?.auth.signOut(); status.textContent = 'Sesión cerrada.'; });
