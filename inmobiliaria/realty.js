const leadForm = document.querySelector('#lead-form');
leadForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(leadForm);
  const name = String(data.get('name')).trim();
  const email = String(data.get('email')).trim();
  const interest = String(data.get('interest'));
  const subject = encodeURIComponent(`Consulta Brisa 28 — ${interest}`);
  const body = encodeURIComponent(`Hola, soy ${name} (${email}).\n\nMe interesa: ${interest}.\n\nQuisiera recibir información de Brisa 28.`);
  window.location.href = `mailto:ventas@brisa28.example?subject=${subject}&body=${body}`;
});
const menuButton = document.querySelector('.menu-toggle');
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  document.querySelector('.header nav').classList.toggle('open', open);
});
