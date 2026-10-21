const cart = { count: 0 };
const count = document.querySelector('#bag-count');
const bag = document.querySelector('.bag');
const toast = document.querySelector('.toast');
let toastTimer;
document.querySelectorAll('[data-product]').forEach((button) => button.addEventListener('click', () => {
  cart.count += 1;
  count.textContent = cart.count;
  bag.setAttribute('aria-label', `Bolsa de compras, ${cart.count} ${cart.count === 1 ? 'producto' : 'productos'}`);
  toast.textContent = `${button.dataset.product} se agregó a tu bolsa.`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
}));
const menuButton = document.querySelector('.menu-toggle');
bag.addEventListener('click', () => {
  const items = cart.count === 1 ? '1 producto' : `${cart.count} productos`;
  toast.textContent = cart.count ? `Tu bolsa tiene ${items}. Esta tienda es una demo.` : 'Tu bolsa está vacía.';
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2300);
});
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  document.querySelector('.header nav').classList.toggle('open', open);
});
