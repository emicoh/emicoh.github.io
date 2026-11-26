// Web institucional EMICOH S.A.
if (window.top !== window.self) { try { window.top.location = window.self.location.href; } catch (e) { document.body.innerHTML = ''; } }
const n = document.getElementById('nav');
document.getElementById('menu').onclick = () => n.classList.toggle('open');
n.querySelectorAll('a').forEach(a => a.onclick = () => n.classList.remove('open'));
document.getElementById('fContacto').onsubmit = e => {
  e.preventDefault();
  alert('Gracias por escribirnos. Este formulario estará activo pronto.');
};
