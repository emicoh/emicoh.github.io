// Funciones compartidas – Cancha Grass EMICOH
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Clave PÚBLICA (publishable). Es segura en el navegador: la seguridad real
// está en las reglas de la base de datos (RLS + funciones del servidor).
export const sb = createClient(
  'https://xonmlmdrkllpwfdedwqx.supabase.co',
  'sb_publishable_D40tzS7kKglKeQhhW9C1eQ__p4XJVyW'
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
  return new Date(ts).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet.';
  return m;
}

export function toast(texto, tipo = 'ok') {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = 'toast ' + tipo; t.textContent = texto; t.classList.add('ver');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('ver'), 4500);
}

export function abrirModal(id) { $(id).classList.add('abierto'); document.body.style.overflow = 'hidden'; }
export function cerrarModal(id) { $(id).classList.remove('abierto'); document.body.style.overflow = ''; }

// Reduce la foto del comprobante antes de subirla (máx. 1600 px, JPG)
export async function prepararImagen(file) {
  if (file.size > 5 * 1024 * 1024 && !/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('La imagen supera 5 MB');
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
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    return { blob: file, ext, type: file.type || 'image/jpeg' };
  }
}
