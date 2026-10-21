const catalog = {
  k68: { name: 'Teclado K68', price: 329 },
  m5: { name: 'Mouse Vector M5', price: 189 },
  h1: { name: 'Audífonos Nube H1', price: 279 },
  s1: { name: 'Micrófono Faro S1', price: 149 },
  c2: { name: 'Control Nexo C2', price: 119 },
  d1: { name: 'Base Plano D1', price: 79 },
};
const bag = new Map();
const bagButton = document.querySelector('.bag-button');
const bagPanel = document.querySelector('.bag-panel');
const backdrop = document.querySelector('.drawer-backdrop');
const bagItems = document.querySelector('#bag-items');
const bagCount = document.querySelector('#bag-count');
const bagTotal = document.querySelector('#bag-total');
const copyButton = document.querySelector('.copy-order');
const toast = document.querySelector('.toast');
let returnFocus = null;
let toastTimer;

function formatPrice(value) {
  return `S/ ${new Intl.NumberFormat('es-PE').format(value)}`;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function openBag() {
  returnFocus = document.activeElement;
  backdrop.hidden = false;
  requestAnimationFrame(() => backdrop.classList.add('is-visible'));
  bagPanel.inert = false;
  bagPanel.setAttribute('aria-hidden', 'false');
  bagPanel.classList.add('is-open');
  bagButton.setAttribute('aria-expanded', 'true');
  document.body.classList.add('drawer-open');
  document.querySelector('.close-bag').focus();
}

function closeBag() {
  bagPanel.classList.remove('is-open');
  bagPanel.inert = true;
  bagPanel.setAttribute('aria-hidden', 'true');
  bagButton.setAttribute('aria-expanded', 'false');
  backdrop.classList.remove('is-visible');
  document.body.classList.remove('drawer-open');
  setTimeout(() => { if (!bagPanel.classList.contains('is-open')) backdrop.hidden = true; }, 250);
  returnFocus?.focus();
}

function updateBag() {
  const rows = [...bag.entries()];
  const itemCount = rows.reduce((sum, [, item]) => sum + item.quantity, 0);
  const total = rows.reduce((sum, [id, item]) => sum + catalog[id].price * item.quantity, 0);
  bagCount.textContent = itemCount;
  bagButton.setAttribute('aria-label', `Abrir bolsa, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`);
  bagTotal.textContent = formatPrice(total);
  copyButton.disabled = rows.length === 0;

  if (!rows.length) {
    bagItems.innerHTML = '<p class="bag-empty">Todavía no agregas equipo.</p>';
    return;
  }

  bagItems.replaceChildren(...rows.map(([id, item]) => {
    const product = catalog[id];
    const row = document.createElement('article');
    row.className = 'bag-row';
    const title = document.createElement('h3');
    title.textContent = product.name;
    const price = document.createElement('span');
    price.className = 'row-price';
    price.textContent = formatPrice(product.price * item.quantity);
    const quantity = document.createElement('div');
    quantity.className = 'quantity';
    const minus = document.createElement('button');
    minus.type = 'button'; minus.dataset.quantity = id; minus.dataset.change = '-1';
    minus.setAttribute('aria-label', `Quitar una unidad de ${product.name}`); minus.textContent = '−';
    const amount = document.createElement('span'); amount.textContent = item.quantity;
    const plus = document.createElement('button');
    plus.type = 'button'; plus.dataset.quantity = id; plus.dataset.change = '1';
    plus.setAttribute('aria-label', `Agregar una unidad de ${product.name}`); plus.textContent = '+';
    quantity.append(minus, amount, plus);
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-item'; remove.dataset.remove = id;
    remove.textContent = 'Quitar';
    row.append(title, price, quantity, remove);
    return row;
  }));
}

document.querySelectorAll('[data-add]').forEach((button) => {
  button.addEventListener('click', () => {
    const id = button.dataset.add;
    const item = bag.get(id) ?? { quantity: 0 };
    item.quantity += 1;
    bag.set(id, item);
    updateBag();
    notify(`${catalog[id].name} se agregó a tu bolsa.`);
  });
});

bagButton.addEventListener('click', openBag);
document.querySelector('.close-bag').addEventListener('click', closeBag);
backdrop.addEventListener('click', closeBag);

bagItems.addEventListener('click', (event) => {
  const change = event.target.closest('[data-quantity]');
  const remove = event.target.closest('[data-remove]');
  if (change) {
    const id = change.dataset.quantity;
    const item = bag.get(id);
    item.quantity += Number(change.dataset.change);
    if (item.quantity <= 0) bag.delete(id);
    updateBag();
  }
  if (remove) {
    bag.delete(remove.dataset.remove);
    updateBag();
  }
});

copyButton.addEventListener('click', async () => {
  const summary = [...bag.entries()].map(([id, item]) => `${item.quantity} × ${catalog[id].name} — ${formatPrice(item.quantity * catalog[id].price)}`).join('\n');
  const total = [...bag.entries()].reduce((sum, [id, item]) => sum + item.quantity * catalog[id].price, 0);
  const text = `Mi selección en Punto de guardado:\n${summary}\nTotal de referencia: ${formatPrice(total)}\n\nCatálogo de muestra; consultar disponibilidad y medios de pago.`;
  try {
    await navigator.clipboard.writeText(text);
    notify('Resumen copiado. Puedes pegarlo donde quieras.');
  } catch {
    const field = document.createElement('textarea');
    field.value = text; field.setAttribute('readonly', ''); field.className = 'sr-only';
    document.body.append(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    notify(copied ? 'Resumen copiado.' : 'No se pudo copiar. Selecciona los productos de nuevo.');
  }
});

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  nav.classList.toggle('is-open', open);
});
nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menú');
}));

document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.filter.is-active')?.classList.remove('is-active');
  button.classList.add('is-active');
  document.querySelectorAll('.filter').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
  showProducts();
}));

document.querySelector('#sort-products').addEventListener('change', showProducts);
const productOrder = new Map([...document.querySelectorAll('.product')].map((product, index) => [product, index]));

function showProducts() {
  const activeFilter = document.querySelector('.filter.is-active').dataset.filter;
  const mode = document.querySelector('#sort-products').value;
  const products = [...document.querySelectorAll('.product')];
  const visible = products.filter((product) => activeFilter === 'all' || product.dataset.category === activeFilter);
  visible.sort((a, b) => {
    if (mode === 'low') return Number(a.dataset.price) - Number(b.dataset.price);
    if (mode === 'high') return Number(b.dataset.price) - Number(a.dataset.price);
    return productOrder.get(a) - productOrder.get(b);
  });
  products.forEach((product) => { product.hidden = !visible.includes(product); });
  const list = document.querySelector('#product-list');
  visible.forEach((product) => list.append(product));
  document.querySelector('#results-count').textContent = `${visible.length} ${visible.length === 1 ? 'producto' : 'productos'}`;
  document.querySelector('#empty-state').hidden = visible.length > 0;
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (bagPanel.classList.contains('is-open')) closeBag();
    if (nav.classList.contains('is-open')) {
      nav.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Abrir menú');
    }
  }
  if (event.key === 'Tab' && bagPanel.classList.contains('is-open')) {
    const focusable = [...bagPanel.querySelectorAll('button:not(:disabled), a[href]')];
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

updateBag();
