const headerMenu = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('#main-nav');
const header = document.querySelector('[data-header]');

if (headerMenu && mainNav) {
  headerMenu.addEventListener('click', () => {
    const isOpen = headerMenu.getAttribute('aria-expanded') !== 'true';
    headerMenu.setAttribute('aria-expanded', String(isOpen));
    headerMenu.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
    mainNav.classList.toggle('open', isOpen);
  });
  mainNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
    headerMenu.setAttribute('aria-expanded', 'false');
    headerMenu.setAttribute('aria-label', 'Abrir menú');
    mainNav.classList.remove('open');
  }));
}

let scrollTicking = false;
const updateScrollUI = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 30);
  scrollTicking = false;
};
window.addEventListener('scroll', () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(updateScrollUI);
    scrollTicking = true;
  }
}, { passive: true });
updateScrollUI();

const revealItems = document.querySelectorAll('[data-reveal]');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: '0px 0px -35px 0px' });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const sectorContent = {
  industria: {
    number: 'Industria',
    kicker: 'Operaciones industriales',
    title: 'La energía como parte<br>de la estrategia productiva.',
    copy: 'Consideramos turnos, equipos de alto consumo y las ventanas disponibles para integrar una solución compatible con el ritmo de producción.'
  },
  retail: {
    number: 'Comercio',
    kicker: 'Comercio y servicios',
    title: 'Una visión coordinada<br>para espacios distribuidos.',
    copy: 'Comparamos sedes, horarios y necesidades compartidas para planificar decisiones energéticas consistentes en distintos locales.'
  },
  logistica: {
    number: 'Logística',
    kicker: 'Logística y almacenamiento',
    title: 'Continuidad pensada<br>para operaciones dinámicas.',
    copy: 'Evaluamos cubiertas, horarios y prioridades operativas para encontrar oportunidades que acompañen el movimiento de cada centro.'
  }
};
const sectorTabs = document.querySelectorAll('[data-sector]');
sectorTabs.forEach((tab) => tab.addEventListener('click', () => {
  const selection = sectorContent[tab.dataset.sector];
  if (!selection) return;
  sectorTabs.forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
  const number = document.querySelector('.sector-mark');
  const kicker = document.querySelector('#sector-kicker');
  const title = document.querySelector('#sector-title');
  const copy = document.querySelector('#sector-copy');
  if (number) number.textContent = selection.number;
  if (kicker) kicker.textContent = selection.kicker;
  if (title) title.innerHTML = selection.title;
  if (copy) copy.textContent = selection.copy;
}));

const filterButtons = document.querySelectorAll('[data-filter]');
const projectCards = document.querySelectorAll('[data-project]');
filterButtons.forEach((button) => button.addEventListener('click', () => {
  const filter = button.dataset.filter;
  let visibleCount = 0;
  filterButtons.forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  projectCards.forEach((card) => {
    const show = filter === 'all' || card.dataset.project === filter;
    card.hidden = !show;
    if (show) visibleCount += 1;
  });
  document.querySelector('.project-grid')?.classList.remove('filtering');
  requestAnimationFrame(() => document.querySelector('.project-grid')?.classList.add('filtering'));
  const emptyState = document.querySelector('.filter-empty');
  if (emptyState) emptyState.hidden = visibleCount > 0;
}));

const form = document.querySelector('#lead-form');
if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const company = String(data.get('company') || '').trim();
    const email = String(data.get('email') || '').trim();
    const role = String(data.get('role') || '').trim();
    const interest = String(data.get('interest') || data.get('type') || '').trim();
    const message = String(data.get('message') || '').trim();
    const summary =
      'Consulta para Cauce Energía\n\nNombre: ' + name + '\nEmpresa: ' + company + '\nCorreo: ' + email +
      (role ? '\nÁrea: ' + role : '') + '\nInterés: ' + interest + '\n\n' + (message || 'Quisiera conversar sobre una evaluación inicial.');
    const note = document.querySelector('#form-note');
    const showCopied = () => {
      if (note) {
        note.textContent = 'Resumen copiado. Ya puedes compartirlo con tu contacto de Cauce Energía.';
        note.classList.add('success');
      }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(summary).then(showCopied).catch(() => {
        if (note) note.textContent = 'No se pudo copiar automáticamente. Selecciona y copia los datos del formulario.';
      });
    } else {
      const temporary = document.createElement('textarea');
      temporary.value = summary;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      const copied = document.execCommand('copy');
      temporary.remove();
      if (copied) showCopied();
      else if (note) note.textContent = 'No se pudo copiar automáticamente. Selecciona y copia los datos del formulario.';
    }
  });
}
