(() => {
  const config = window.CLINICA_CONFIG ?? {};
  const year = document.querySelector('#year');
  if (year) year.textContent = new Date().getFullYear();

  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
    }), { threshold: 0.08 });
    const targets = '.opening-copy .lede,.opening-copy .intro-actions,.opening-copy .intro-footnote,.care-section .section-lede,.care-list li,.section-content>.section-lede,.visit-steps li,.people-copy>p,.people-copy .text-link,.booking-content>.booking-intro,.booking-content .booking-step,.faq-list details';
    document.querySelectorAll('.photo-scene').forEach((section) => {
      section.querySelectorAll(targets).forEach((element, index) => {
        element.classList.add('reveal-item'); element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 65}ms`); revealObserver.observe(element);
      });
    });
  }

  // Keep service and FAQ disclosures easy to scan on both touch and keyboard.
  document.querySelectorAll('.care-list details, .faq-list details').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      const group = details.closest('.care-list, .faq-list');
      group?.querySelectorAll('details[open]').forEach((other) => { if (other !== details) other.open = false; });
    });
  });

  const shareButton = document.querySelector('#share-page');
  const shareStatus = document.querySelector('#share-status');
  shareButton?.addEventListener('click', async () => {
    const shareData = { title: document.title, text: 'Conoce Pausa, una propuesta de clínica dental que empieza por escuchar.', url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        shareStatus.textContent = 'Enlace copiado. Ya puedes compartirlo.';
        return;
      } else {
        shareStatus.textContent = 'Copia el enlace desde la barra del navegador para compartirlo.';
        return;
      }
      shareStatus.textContent = 'Gracias por compartir Pausa.';
    } catch (error) {
      if (error.name !== 'AbortError') shareStatus.textContent = 'No se pudo compartir. Prueba copiando el enlace del navegador.';
    }
  });

  const navLinks = [...document.querySelectorAll('.masthead nav a')];
  const navSections = navLinks.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window && navSections.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => {
        const active = link.hash === `#${visible.target.id}`;
        if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .15, .5] });
    navSections.forEach((section) => sectionObserver.observe(section));
  }

  const form = document.querySelector('#booking-form');
  if (!form) return;
  const alertBox = document.querySelector('#booking-alert');
  const serviceSelect = document.querySelector('#service-select');
  const professionalSelect = document.querySelector('#professional-select');
  const dateSelect = document.querySelector('#date-select');
  const checkButton = document.querySelector('#check-slots');
  const slotStep = document.querySelector('#slot-step');
  const slotList = document.querySelector('#slot-list');
  const contactStep = document.querySelector('#step-contact');
  const reviewStep = document.querySelector('#booking-review');
  const summary = document.querySelector('#booking-summary');
  const success = document.querySelector('#booking-success');
  const state = { services: [], professionals: [], selectedSlot: null, requestId: null };
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || '') && Boolean(config.supabaseAnonKey);

  function announce(message, kind = '') {
    alertBox.textContent = message;
    alertBox.dataset.kind = kind;
  }
  function endpoint(name) { return `${config.supabaseUrl.replace(/\/$/, '')}/functions/v1/${name}`; }
  async function api(name, body) {
    if (!configured) throw new Error('La agenda aún no está conectada. No se ha enviado ninguna cita.');
    const response = await fetch(endpoint(name), {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No pudimos consultar la agenda. Inténtalo más tarde.');
    return result;
  }
  function localDate(date) {
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'full', timeZone: config.timezone || 'America/Lima' }).format(new Date(date));
  }
  function localTime(date) {
    return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone || 'America/Lima' }).format(new Date(date));
  }
  function chooseSlot(slot, button) {
    state.selectedSlot = slot;
    slotList.querySelectorAll('button').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    contactStep.hidden = false;
    reviewStep.hidden = true;
    document.querySelector('#patient-name').focus({ preventScroll: true });
  }
  function setSelect(select, options, placeholder) {
    select.replaceChildren(new Option(placeholder, ''));
    options.forEach((item) => select.add(new Option(item.name, item.id)));
    select.disabled = options.length === 0;
  }

  async function loadCatalog() {
    if (!configured) {
      announce('Sitio de muestra. La agenda aún no está conectada, así que no se muestran horarios y no se reciben citas.');
      return;
    }
    try {
      const catalog = await api('public-catalog', {});
      if (!catalog.clinic?.bookings_open) {
        announce('La clínica todavía no ha abierto su agenda. No se reciben solicitudes de reserva.');
        [serviceSelect, professionalSelect, dateSelect, checkButton].forEach((control) => { control.disabled = true; });
        return;
      }
      state.services = catalog.services || [];
      state.professionals = catalog.professionals || [];
      setSelect(serviceSelect, state.services, state.services.length ? 'Selecciona un tratamiento' : 'La clínica todavía no ha publicado servicios');
      serviceSelect.disabled = state.services.length === 0;
      announce(state.services.length ? 'Selecciona el servicio para consultar la agenda en tiempo real.' : 'La clínica debe publicar sus servicios y horarios antes de abrir reservas.');
    } catch (error) { announce(error.message, 'error'); }
  }

  serviceSelect.addEventListener('change', () => {
    const service = state.services.find((item) => item.id === serviceSelect.value);
    const allowed = service ? state.professionals.filter((person) => service.professional_ids?.includes(person.id)) : [];
    setSelect(professionalSelect, allowed, allowed.length ? 'Elige al profesional' : 'No hay profesionales publicados para este servicio');
    professionalSelect.disabled = allowed.length === 0;
    dateSelect.disabled = true;
    checkButton.disabled = true;
    slotStep.hidden = true; contactStep.hidden = true; reviewStep.hidden = true;
    state.selectedSlot = null;
    if (service && allowed.length) {
      professionalSelect.insertBefore(new Option('Cualquier profesional disponible', 'any'), professionalSelect.options[1] || null);
      professionalSelect.disabled = false;
      dateSelect.disabled = false;
      checkButton.disabled = false;
    }
  });
  professionalSelect.addEventListener('change', () => {
    dateSelect.disabled = !professionalSelect.value;
    checkButton.disabled = !professionalSelect.value;
    slotStep.hidden = true; contactStep.hidden = true; reviewStep.hidden = true;
    state.selectedSlot = null;
  });

  const now = new Date();
  const dateInClinic = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone || 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  dateSelect.min = dateInClinic;
  dateSelect.addEventListener('change', () => { slotStep.hidden = true; contactStep.hidden = true; reviewStep.hidden = true; state.selectedSlot = null; });

  checkButton.addEventListener('click', async () => {
    if (!serviceSelect.value || !professionalSelect.value || !dateSelect.value) { announce('Elige tratamiento, profesional y fecha para consultar los espacios.', 'error'); return; }
    checkButton.disabled = true; slotList.replaceChildren(); slotStep.hidden = false; contactStep.hidden = true; reviewStep.hidden = true;
    announce('Consultando la disponibilidad actual…');
    try {
      const result = await api('available-slots', { service_id: serviceSelect.value, professional_id: professionalSelect.value === 'any' ? null : professionalSelect.value, date: dateSelect.value });
      const slots = result.slots || [];
      if (!slots.length) { announce('No quedan horarios para esa fecha. Elige otro día y vuelve a consultar.'); return; }
      slots.forEach((slot) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'slot-choice'; button.textContent = localTime(slot.starts_at); button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => chooseSlot(slot, button)); slotList.append(button);
      });
      announce('Estos espacios se acaban de consultar en la agenda. Se volverán a validar al confirmar.', 'success');
    } catch (error) { announce(error.message, 'error'); }
    finally { checkButton.disabled = false; }
  });

  document.querySelector('#review-booking').addEventListener('click', () => {
    if (!state.selectedSlot || !form.reportValidity()) return;
    const fields = new FormData(form);
    const rows = [
      ['Atención', state.services.find((item) => item.id === serviceSelect.value)?.name || ''],
      ['Profesional', state.professionals.find((item) => item.id === state.selectedSlot.professional_id)?.name || 'Equipo disponible'],
      ['Fecha', localDate(state.selectedSlot.starts_at)], ['Hora', localTime(state.selectedSlot.starts_at)],
      ['Nombre', fields.get('name').toString().trim()], ['Teléfono', fields.get('phone').toString().trim()], ['Correo', fields.get('email').toString().trim()],
    ];
    summary.replaceChildren(...rows.flatMap(([label, value]) => {
      const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = value;
      return [dt, dd];
    }));
    reviewStep.hidden = false; document.querySelector('#confirm-booking').focus({ preventScroll: true });
  });

  document.querySelector('#confirm-booking').addEventListener('click', async (event) => {
    if (!state.selectedSlot || !form.reportValidity()) return;
    const button = event.currentTarget; button.disabled = true; announce('Volviendo a validar el horario y registrando la cita…');
    state.requestId ||= crypto.randomUUID();
    try {
      const fields = new FormData(form);
      const result = await api('create-booking', {
        request_id: state.requestId, service_id: serviceSelect.value, professional_id: state.selectedSlot.professional_id,
        starts_at: state.selectedSlot.starts_at, name: fields.get('name').toString().trim(), phone: fields.get('phone').toString().trim(),
        email: fields.get('email').toString().trim(), privacy_consent: fields.get('privacy_consent') === 'on', policy_version: config.policyVersion,
      });
      reviewStep.hidden = true; success.hidden = false;
      document.querySelector('#booking-code').textContent = result.booking_code || '—';
      document.querySelector('#success-message').textContent = result.status === 'confirmed'
        ? 'La reserva quedó guardada. El correo se enviará cuando el servicio de notificaciones esté configurado.'
        : 'La solicitud quedó guardada y espera revisión de la agenda. No la consideres confirmada hasta recibir la confirmación de la clínica.';
      announce('El servidor respondió con el estado de la reserva.', 'success');
      form.querySelectorAll('input,select,button').forEach((control) => { if (control.id !== 'confirm-booking') control.disabled = true; });
    } catch (error) { state.requestId = null; announce(error.message, 'error'); button.disabled = false; }
  });

  loadCatalog();
})();
