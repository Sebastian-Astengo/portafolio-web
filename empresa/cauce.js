const headerMenu = document.querySelector('.menu-toggle');
const mainNav = document.querySelector('#main-nav');
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

const form = document.querySelector('#lead-form');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = String(data.get('name')).trim();
  const email = String(data.get('email')).trim();
  const type = String(data.get('type'));
  const subject = encodeURIComponent(`Consulta Cauce Energía — ${type}`);
  const body = encodeURIComponent(`Hola, soy ${name} (${email}).\n\nMe interesa explorar una solución energética para: ${type}.\n\nQuisiera coordinar una evaluación inicial.`);
  window.location.href = `mailto:hola@cauceenergia.example?subject=${subject}&body=${body}`;
});
