// Funciones compartidas – Cancha Grass EMICOH
// La librería de Supabase se carga en el HTML con versión fija y huella de integridad (SRI).

// Protección contra "clickjacking": la página no funciona dentro de marcos de otros sitios.
if (window.top !== window.self) {
  try { if (window.top.location.origin !== location.origin) throw 0; }
  catch { document.documentElement.innerHTML = '<p style="font:16px sans-serif;padding:20px">Por seguridad abre esta página directamente: <a href="' + location.href + '" target="_top">' + location.host + '</a></p>'; throw new Error('enmarcado'); }
}

// ---------- "Mantener sesión iniciada en este dispositivo" ----------
const K_MANTENER = 'emicoh_mantener', K_CORREO = 'emicoh_correo';
export const mantenerSesion = () => localStorage.getItem(K_MANTENER) !== '0';
export function fijarMantener(si) {
  localStorage.setItem(K_MANTENER, si ? '1' : '0');
}
export const correoRecordado = () => (mantenerSesion() && localStorage.getItem(K_CORREO)) || '';
export function recordarCorreo(email) {
  if (mantenerSesion() && email) localStorage.setItem(K_CORREO, email); else localStorage.removeItem(K_CORREO);
}
// Si se mantiene: la sesión vive en este dispositivo. Si no: se borra al cerrar el navegador.
const almacen = {
  getItem: k => (mantenerSesion() ? localStorage : sessionStorage).getItem(k),
  setItem: (k, v) => {
    const [usar, limpiar] = mantenerSesion() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    usar.setItem(k, v); limpiar.removeItem(k);
  },
  removeItem: k => { localStorage.removeItem(k); sessionStorage.removeItem(k); },
};

// Clave PÚBLICA (publishable). Es segura en el navegador: la seguridad real
// está en las reglas de la base de datos (RLS + funciones del servidor).
export const sb = window.supabase.createClient(
  'https://xonmlmdrkllpwfdedwqx.supabase.co',
  'sb_publishable_D40tzS7kKglKeQhhW9C1eQ__p4XJVyW',
  { auth: { storage: almacen, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Fecha de hoy en Lima (YYYY-MM-DD)
export function hoyLima(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(d);
}
export function horaLima() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = p.split(':').map(Number);
  return h + m / 60;
}
// Horas que faltan (hora de Lima) para el inicio de un turno
export function horasHasta(fecha, hora) {
  const dias = (Date.parse(fecha) - Date.parse(hoyLima())) / 86400000;
  return dias * 24 + hora - horaLima();
}
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
export function fechaCorta(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return { dia: DIAS[dt.getUTCDay()], num: d, mes: MESES[m - 1] };
}
export function fechaLarga(iso) {
  const f = fechaCorta(iso);
  return `${f.dia} ${f.num} ${f.mes}`;
}
export const hh = h => String(h).padStart(2, '0') + ':00';
export const soles = n => 'S/ ' + Number(n || 0).toFixed(2);
export function horaDe(ts) {
  return new Date(ts).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\.$/, '');
}

// Enlace de WhatsApp (agrega 51 a celulares peruanos de 9 dígitos)
export function enlaceWhatsApp(numero, texto = '') {
  let n = String(numero || '').replace(/\D/g, '');
  if (!n) return '';
  if (n.length === 9) n = '51' + n;
  return `https://wa.me/${n}` + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

export const ESTADOS = {
  pendiente_pago: ['Pendiente de pago', 'amarillo'],
  por_verificar: ['Pago en verificación', 'azul'],
  confirmada: ['Confirmada', 'verde'],
  rechazada: ['Rechazada', 'rojo'],
  cancelada: ['Cancelada', 'gris'],
  expirada: ['Vencida (no se pagó)', 'gris'],
};
export function chipEstado(e) {
  const [t, c] = ESTADOS[e] || [e, 'gris'];
  return `<span class="chip ${c}">${esc(t)}</span>`;
}

// Mensaje de error legible desde Supabase/Postgres
export function msgError(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/User already registered/i.test(m)) return 'Ese correo ya está registrado. Inicia sesión.';
  if (/Database error saving new user/i.test(m)) return 'No se pudo registrar: el DNI ya está registrado o algún dato no es válido.';
  if (/Password should be at least/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres.';
  if (/Password should contain|weak.?password/i.test(m)) return 'La contraseña debe tener al menos 8 caracteres, con letras y números.';
  if (/Email not confirmed/i.test(m)) return 'Tu correo aún no está confirmado. Comunícate con la administración.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Revisa tu internet.';
  if (/JWT expired|invalid JWT|session.*(missing|not found)/i.test(m)) return 'Tu sesión venció. Vuelve a ingresar.';
  return m;
}

export function toast(texto, tipo = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.className = 'toast ' + tipo; t.textContent = texto; t.classList.add('ver');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('ver'), tipo === 'error' ? 6500 : 4500);
}

export function abrirModal(id) { $(id).classList.add('abierto'); document.body.style.overflow = 'hidden'; }
export function cerrarModal(id) { $(id).classList.remove('abierto'); if (!$('.modal.abierto')) document.body.style.overflow = ''; }

// ---------- Contraseñas ----------
// Regla (igual en el servidor): 8 a 72 caracteres, con al menos una letra y un número.
export function claveValida(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p) && /\d/.test(p);
}
const COMUNES = ['12345678', '123456789', 'password', 'contraseña', 'qwerty', 'abc12345', 'emicoh', 'huayna', 'cancha', 'futbol', 'peru'];
export function fuerzaClave(p) {
  if (!p) return { n: 0, t: '' };
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-zñ]/.test(p) && /[A-ZÑ]/.test(p)) n++;
  if (/\d/.test(p) && /[A-Za-zñÑ]/.test(p)) n++;
  if (/[^A-Za-z0-9ñÑ]/.test(p)) n++;
  if (COMUNES.some(c => p.toLowerCase().includes(c)) || /^(.)\1+$/.test(p)) n = Math.min(n, 1);
  if (!claveValida(p)) n = Math.min(n, 1);
  const t = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Fuerte', 'Muy fuerte'][Math.min(n, 5)];
  return { n: Math.min(n, 4), t };
}

// Agrega el botón del ojo, el aviso de MAYÚSCULAS y el medidor (data-fuerza) a los campos de contraseña
export function mejorarClaves(raiz = document) {
  $$('input[type=password]', raiz).forEach(inp => {
    if (inp.dataset.listo) return; inp.dataset.listo = '1';
    const caja = document.createElement('div'); caja.className = 'clave';
    inp.parentNode.insertBefore(caja, inp); caja.appendChild(inp);
    const ojo = document.createElement('button');
    ojo.type = 'button'; ojo.className = 'ojo'; ojo.setAttribute('aria-label', 'Mostrar contraseña'); ojo.title = 'Mostrar contraseña';
    ojo.innerHTML = OJO_ABIERTO;
    ojo.onclick = () => {
      const ver = inp.type === 'password';
      inp.type = ver ? 'text' : 'password';
      ojo.innerHTML = ver ? OJO_CERRADO : OJO_ABIERTO;
      ojo.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña'); ojo.title = ojo.getAttribute('aria-label');
      inp.focus();
    };
    caja.appendChild(ojo);
    const caps = document.createElement('div'); caps.className = 'caps oculto'; caps.textContent = '⚠️ Tienes activadas las MAYÚSCULAS';
    caja.after(caps);
    const revisarCaps = e => { if (e.getModifierState) caps.classList.toggle('oculto', !e.getModifierState('CapsLock')); };
    inp.addEventListener('keydown', revisarCaps); inp.addEventListener('keyup', revisarCaps);
    inp.addEventListener('blur', () => caps.classList.add('oculto'));
    if (inp.hasAttribute('data-fuerza')) {
      const m = document.createElement('div'); m.className = 'fuerza';
      m.innerHTML = '<div class="barra"><i></i></div><span></span>';
      caps.after(m);
      const pintar = () => {
        const f = fuerzaClave(inp.value);
        m.dataset.n = inp.value ? f.n : '';
        m.querySelector('i').style.width = inp.value ? (f.n + 1) * 20 + '%' : '0';
        m.querySelector('span').textContent = inp.value ? f.t + (claveValida(inp.value) ? '' : ' · usa 8+ caracteres con letras y números') : 'Mínimo 8 caracteres, con letras y números';
      };
      inp.addEventListener('input', pintar); pintar();
    }
  });
}
// Al cerrar un formulario, vuelve a ocultar las contraseñas
export function ocultarClaves(raiz) {
  $$('.clave input', raiz).forEach(i => { i.type = 'password'; });
  $$('.clave .ojo', raiz).forEach(o => { o.innerHTML = OJO_ABIERTO; o.setAttribute('aria-label', 'Mostrar contraseña'); });
}
const OJO_ABIERTO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const OJO_CERRADO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 3l18 18M10.6 5.1A11 11 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.6 6.6C3.3 8.6 1 12 1 12s4 7 11 7a10.6 10.6 0 0 0 5.4-1.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

// Freno local a intentos de ingreso (además del límite del servidor)
const K_INTENTOS = 'emicoh_intentos';
export function esperaIngreso() {
  const d = JSON.parse(localStorage.getItem(K_INTENTOS) || '{"n":0,"hasta":0}');
  return Math.max(0, Math.ceil((d.hasta - Date.now()) / 1000));
}
export function ingresoFallido() {
  const d = JSON.parse(localStorage.getItem(K_INTENTOS) || '{"n":0,"hasta":0}');
  d.n++;
  if (d.n >= 5) d.hasta = Date.now() + Math.min(15 * 60, 30 * 2 ** (d.n - 5)) * 1000;
  localStorage.setItem(K_INTENTOS, JSON.stringify(d));
}
export const ingresoCorrecto = () => localStorage.removeItem(K_INTENTOS);

// Cierra la sesión tras un tiempo sin actividad
export function vigilarInactividad(minutos, alVencer) {
  let ultimo = Date.now();
  const marcar = () => { ultimo = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(e => addEventListener(e, marcar, { passive: true }));
  setInterval(() => { if (Date.now() - ultimo > minutos * 60000) { ultimo = Date.now(); alVencer(); } }, 30000);
}

// Reduce la foto del comprobante antes de subirla (máx. 1600 px, JPG)
export async function prepararImagen(file) {
  if (!file || !file.size) throw new Error('Elige la captura del pago');
  if (!/^image\//.test(file.type || 'image/')) throw new Error('El comprobante debe ser una imagen');
  if (file.size > 15 * 1024 * 1024) throw new Error('La imagen es demasiado grande');
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return { blob, ext: 'jpg', type: 'image/jpeg' };
  } catch {
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera 5 MB');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    return { blob: file, ext, type: file.type || 'image/jpeg' };
  }
}
