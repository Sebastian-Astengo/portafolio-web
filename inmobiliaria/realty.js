const currency = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 0,
});

const cards = [...document.querySelectorAll('.unit-card')];
const grid = document.querySelector('#unit-grid');
const bedsFilter = document.querySelector('#filter-beds');
const sortSelect = document.querySelector('#sort-units');
const savedToggle = document.querySelector('#saved-toggle');
const savedCount = document.querySelector('#saved-count');
const resultsNote = document.querySelector('#results-note');
const compareTray = document.querySelector('#compare-tray');
const compareItems = document.querySelector('#compare-items');
const compareSummary = document.querySelector('#compare-summary');
const compareIds = new Set();
const favoritesKey = 'brisa28-favoritos-v1';

let favorites = new Set();
try {
  favorites = new Set(JSON.parse(localStorage.getItem(favoritesKey) || '[]'));
} catch {
  favorites = new Set();
}

let favoritesOnly = false;
const emptyMessage = document.createElement('p');
emptyMessage.className = 'empty-units';
emptyMessage.id = 'empty-units';
emptyMessage.hidden = true;
emptyMessage.textContent = 'No hay tipologías con estos filtros. Prueba otra combinación.';
grid.after(emptyMessage);

function saveFavorites() {
  try {
    localStorage.setItem(favoritesKey, JSON.stringify([...favorites]));
  } catch {
    // The current page still works when browser storage is unavailable.
  }
}

function syncFavorites() {
  for (const card of cards) {
    const button = card.querySelector('.favorite-button');
    const saved = favorites.has(card.dataset.id);
    button.setAttribute('aria-pressed', String(saved));
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-label', `${saved ? 'Quitar de guardadas' : 'Guardar'} tipología de ${card.dataset.beds} ${card.dataset.beds === '1' ? 'dormitorio' : 'dormitorios'}`);
  }
  savedCount.textContent = String(favorites.size);
  savedToggle.setAttribute('aria-pressed', String(favoritesOnly));
  savedToggle.firstChild.textContent = favoritesOnly ? 'Ver todas ' : 'Ver guardadas ';
}

function renderUnits() {
  const selectedBeds = bedsFilter.value;
  const visible = cards.filter((card) => {
    const matchesBeds = selectedBeds === 'all' || card.dataset.beds === selectedBeds;
    const matchesFavorite = !favoritesOnly || favorites.has(card.dataset.id);
    return matchesBeds && matchesFavorite;
  });

  const sorting = sortSelect.value;
  visible.sort((a, b) => {
    if (sorting === 'area-asc') return Number(a.dataset.area) - Number(b.dataset.area);
    if (sorting === 'area-desc') return Number(b.dataset.area) - Number(a.dataset.area);
    return Number(a.dataset.rank) - Number(b.dataset.rank);
  });

  for (const card of visible) grid.append(card);
  for (const card of cards) card.hidden = !visible.includes(card);
  emptyMessage.hidden = visible.length !== 0;
  const count = visible.length;
  resultsNote.textContent = `${count} ${count === 1 ? 'tipología disponible en esta selección' : 'tipologías en esta selección'}`;
  syncFavorites();
}

function renderComparison() {
  const selected = cards.filter((card) => compareIds.has(card.dataset.id));
  compareTray.hidden = selected.length === 0;
  document.body.classList.toggle('has-comparison', selected.length > 0);
  compareSummary.textContent = selected.length === 1
    ? 'Añade otra tipología para comparar superficies y espacios.'
    : `${selected.length} tipologías · revisa área y dormitorios.`;
  compareItems.replaceChildren(...selected.map((card) => {
    const item = document.createElement('div');
    item.className = 'compare-item';
    const title = document.createElement('strong');
    title.textContent = card.querySelector('h3').textContent;
    const detail = document.createElement('span');
    detail.textContent = `${card.dataset.beds} dorm. · ${card.dataset.area} m² ref.`;
    item.append(title, detail);
    return item;
  }));
  for (const card of cards) {
    const button = card.querySelector('.compare-button');
    const selectedNow = compareIds.has(card.dataset.id);
    button.setAttribute('aria-pressed', String(selectedNow));
    button.textContent = selectedNow ? 'En comparación' : 'Comparar';
  }
}

bedsFilter.addEventListener('change', renderUnits);
sortSelect.addEventListener('change', renderUnits);
savedToggle.addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  renderUnits();
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  bedsFilter.value = 'all';
  sortSelect.value = 'recommended';
  favoritesOnly = false;
  renderUnits();
});

grid.addEventListener('click', (event) => {
  const favoriteButton = event.target.closest('.favorite-button');
  if (favoriteButton) {
    const id = favoriteButton.closest('.unit-card').dataset.id;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavorites();
    renderUnits();
    return;
  }

  const compareButton = event.target.closest('.compare-button');
  if (compareButton) {
    const id = compareButton.closest('.unit-card').dataset.id;
    if (compareIds.has(id)) compareIds.delete(id);
    else if (compareIds.size < 3) compareIds.add(id);
    else {
      compareSummary.textContent = 'Puedes comparar hasta tres tipologías a la vez. Quita una para añadir otra.';
      compareTray.hidden = false;
      return;
    }
    renderComparison();
  }
});

document.querySelector('#compare-clear').addEventListener('click', () => {
  compareIds.clear();
  renderComparison();
});

document.querySelectorAll('[data-select-unit]').forEach((link) => {
  link.addEventListener('click', () => {
    const card = cards.find((unit) => unit.dataset.id === link.dataset.selectUnit);
    const note = document.querySelector('#selected-unit-note');
    if (card && note) note.textContent = `Tipología seleccionada: ${card.querySelector('h3').textContent} · ${card.dataset.area} m² referenciales. Ingresa el precio acordado para estimar la cuota.`;
    window.setTimeout(() => document.querySelector('#home-price').focus({ preventScroll: true }), 250);
  });
});

const downPayment = document.querySelector('#down-payment');
downPayment.addEventListener('input', () => {
  document.querySelector('#down-percent').textContent = `${downPayment.value}%`;
});

document.querySelector('#calculator-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const price = Number(document.querySelector('#home-price').value);
  const downPercent = Number(downPayment.value);
  const annualRate = Number(document.querySelector('#interest-rate').value);
  const years = Number(document.querySelector('#loan-years').value);
  const principal = price * (1 - downPercent / 100);
  const months = years * 12;
  const monthlyRate = annualRate / 1200;
  const payment = monthlyRate === 0
    ? principal / months
    : principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
  const result = document.querySelector('#calculator-result');
  result.classList.add('is-ready');
  result.innerHTML = `<p>Cuota mensual estimada</p><strong>${currency.format(payment)}</strong><small>Inicial: ${currency.format(price * downPercent / 100)} · Crédito estimado: ${currency.format(principal)} · ${years} años</small>`;
});

const leadForm = document.querySelector('#lead-form');
const preparedMessage = document.querySelector('#prepared-message');
const formStatus = document.querySelector('#form-status');
const copyMessage = document.querySelector('#copy-message');

leadForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!leadForm.reportValidity()) return;
  const data = new FormData(leadForm);
  const name = String(data.get('name')).trim();
  const email = String(data.get('email')).trim();
  const phone = String(data.get('phone')).trim();
  const interest = String(data.get('interest'));
  const contactLine = phone ? `Teléfono: ${phone}.\n` : '';
  const body = `Hola, soy ${name} (${email}).\n${contactLine}\nMe interesa conocer sobre ${interest} en Brisa 28.\n\nQuisiera recibir información y coordinar el siguiente paso.`;
  preparedMessage.value = body;
  preparedMessage.hidden = false;
  copyMessage.hidden = false;
  formStatus.classList.remove('error');
  formStatus.textContent = 'Solicitud preparada. Se abrirá tu correo; añade el contacto comercial del proyecto para enviarla.';
  const subject = encodeURIComponent(`Consulta Brisa 28 · ${interest}`);
  window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(body)}`;
});

copyMessage.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(preparedMessage.value);
    formStatus.textContent = 'Solicitud copiada. Ya puedes pegarla en tu correo o mensaje.';
  } catch {
    preparedMessage.focus();
    preparedMessage.select();
    const copied = document.execCommand('copy');
    formStatus.textContent = copied
      ? 'Solicitud copiada. Ya puedes pegarla en tu correo o mensaje.'
      : 'Selecciona el mensaje y cópialo para enviarlo.';
  }
});

const menuButton = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('#primary-nav');
function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menú');
  primaryNav.classList.remove('open');
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  primaryNav.classList.toggle('open', open);
});
primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeMenu();
});

const header = document.querySelector('.header');
const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

renderUnits();
renderComparison();
