import { sb, $, $$, esc, hoyLima, fechaLarga, hh, soles, horaDe, chipEstado, msgError, toast, abrirModal, cerrarModal, enlaceWhatsApp, vigilarInactividad } from './comun.js?v=3';

let user = null, perfil = null;

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user;
  if (!user) { location.href = './'; return; }
  const { data } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  perfil = data;
  $('#zonaUsuario').innerHTML = `<span>${esc(perfil?.nombres || '')}</span><a class="btn chico sec" href="./">Ver reservas</a><button class="btn chico sec" id="btnSalir">Salir</button>`;
  $('#btnSalir').onclick = async () => { await sb.auth.signOut({ scope: 'local' }); location.href = './'; };
  if (perfil?.rol !== 'admin' || perfil?.bloqueado) { $('#sinAcceso').classList.remove('oculto'); return; }
  $('#app').classList.remove('oculto');
  // Por seguridad, el panel se cierra tras 30 minutos sin actividad
  vigilarInactividad(30, async () => { await sb.auth.signOut({ scope: 'local' }); alert('Por seguridad cerramos tu sesión tras 30 minutos sin actividad.'); location.href = './'; });
  $('#agDesde').value = hoyLima(); $('#agHasta').value = hoyLima(7);
  $('#fBloqueo [name=fecha]').value = hoyLima(1);
  $('#blHora').innerHTML = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hh(h)}</option>`).join('');
  $('#blHora').value = 8;
  cargarPendientes();
  setInterval(cargarPendientes, 60000);
}

$$('#tabsAdmin button').forEach(b => b.onclick = () => {
  $$('#tabsAdmin button').forEach(x => x.classList.toggle('act', x === b));
  $$('.sec').forEach(s => s.classList.toggle('oculto', s.id !== 'sec-' + b.dataset.sec));
  ({ verificar: cargarPendientes, agenda: cargarAgenda, usuarios: cargarUsuarios, config: cargarConfig, seguridad: cargarBitacora })[b.dataset.sec]();
});

// ---------- por verificar ----------
async function cargarPendientes() {
  const { data, error } = await sb.rpc('admin_pendientes');
  if (error) return toast(msgError(error), 'error');
  $('#nPend').textContent = data.length ? `(${data.length})` : '';
  const c = $('#listaPend');
  if (!data.length) { c.innerHTML = '<div class="vacio">No hay pagos pendientes de verificar. 👍</div>'; return; }
  c.innerHTML = data.map(r => `
    <div class="item">
      <div class="top"><div><b>${esc(fechaLarga(r.fecha))} · ${hh(r.hora_inicio)} a ${hh(r.hora_inicio + r.horas)}</b><br>
        ${esc(r.nombre)} · DNI ${esc(r.dni)} · Cel. ${esc(r.celular)}</div>${chipEstado(r.estado)}</div>
      <p style="margin-top:6px"><b>${soles(r.monto)}</b> por <b>${esc(r.metodo.toUpperCase())}</b>
        ${r.nro_operacion ? ` · N.° operación: <b>${esc(r.nro_operacion)}</b>` : ''}
        ${r.estado === 'pendiente_pago' ? `<br><span class="nota">Debe pagar en oficina antes de ${esc(horaDe(r.vence_en))}</span>` : ''}</p>
      <div class="acciones">
        ${r.comprobante_path ? `<button class="btn chico sec" data-ver="${esc(r.comprobante_path)}">Ver captura</button>` : ''}
        <button class="btn chico" data-conf="${r.id}">${r.metodo === 'efectivo' ? 'Recibí el efectivo' : 'Pago correcto · Confirmar'}</button>
        <button class="btn chico rojo" data-rech="${r.id}">Rechazar</button>
        <a class="btn chico sec" href="https://wa.me/51${esc(r.celular)}" target="_blank" rel="noopener">WhatsApp</a>
      </div>
    </div>`).join('');
  enlazarAcciones(c, cargarPendientes);
}

function enlazarAcciones(c, recargar) {
  $$('[data-ver]', c).forEach(b => b.onclick = () => verComprobante(b.dataset.ver));
  $$('[data-conf]', c).forEach(b => b.onclick = async () => {
    const nota = prompt('Nota (opcional), por ejemplo "Yape verificado":', '') ?? null;
    if (nota === null) return;
    const { error } = await sb.rpc('admin_confirmar', { p_id: +b.dataset.conf, p_nota: nota || null });
    if (error) return toast(msgError(error), 'error');
    toast('Reserva confirmada'); recargar();
  });
  $$('[data-rech]', c).forEach(b => b.onclick = async () => {
    const nota = prompt('Motivo del rechazo (la persona lo verá):', 'No se encontró el pago');
    if (!nota) return;
    const { error } = await sb.rpc('admin_rechazar', { p_id: +b.dataset.rech, p_nota: nota });
    if (error) return toast(msgError(error), 'error');
    toast('Reserva rechazada'); recargar();
  });
  $$('[data-desbloq]', c).forEach(b => b.onclick = async () => {
    if (!confirm('¿Quitar este bloqueo?')) return;
    const { error } = await sb.rpc('admin_quitar_bloqueo', { p_id: +b.dataset.desbloq });
    if (error) return toast(msgError(error), 'error');
    toast('Bloqueo quitado'); recargar();
  });
}

async function verComprobante(ruta) {
  const { data, error } = await sb.storage.from('comprobantes').createSignedUrl(ruta, 300);
  if (error) return toast(msgError(error), 'error');
  $('#compCont').innerHTML = `<img class="comp" src="${esc(data.signedUrl)}" alt="Comprobante"><p class="nota">Enlace válido por 5 minutos.</p>`;
  abrirModal('#mComp');
}

// ---------- agenda ----------
async function cargarAgenda() {
  const { data, error } = await sb.rpc('admin_reservas', { p_desde: $('#agDesde').value, p_hasta: $('#agHasta').value });
  if (error) return toast(msgError(error), 'error');
  const c = $('#tablaAgenda');
  if (!data.length) { c.innerHTML = '<div class="vacio">Sin reservas en esas fechas.</div>'; return; }
  c.innerHTML = `<table><tr><th>Fecha</th><th>Hora</th><th>Quién</th><th>Pago</th><th>Estado</th><th></th></tr>` + data.map(r => `
    <tr><td>${esc(fechaLarga(r.fecha))}</td><td>${hh(r.hora_inicio)}–${hh(r.hora_inicio + r.horas)}</td>
    <td>${r.tipo === 'bloqueo' ? `<b>BLOQUEO</b>: ${esc(r.motivo)}` : `${esc(r.nombre)}<br><span class="nota">DNI ${esc(r.dni)} · ${esc(r.celular)}</span>`}</td>
    <td>${r.tipo === 'bloqueo' ? '' : `${soles(r.monto)} ${esc((r.metodo || '').toUpperCase())}${r.nro_operacion ? '<br><span class="nota">Op. ' + esc(r.nro_operacion) + '</span>' : ''}`}</td>
    <td>${chipEstado(r.estado)}${r.nota_admin ? `<br><span class="nota">${esc(r.nota_admin)}</span>` : ''}</td>
    <td>${r.tipo === 'bloqueo' && r.estado === 'confirmada' ? `<button class="btn chico sec" data-desbloq="${r.id}">Quitar</button>` : ''}
        ${r.comprobante_path ? `<button class="btn chico sec" data-ver="${esc(r.comprobante_path)}">Captura</button>` : ''}
        ${r.tipo === 'reserva' && ['pendiente_pago', 'por_verificar'].includes(r.estado) ? `<button class="btn chico" data-conf="${r.id}">Confirmar</button>` : ''}
        ${r.tipo === 'reserva' && ['pendiente_pago', 'por_verificar', 'confirmada'].includes(r.estado) ? `<button class="btn chico rojo" data-rech="${r.id}">Anular</button>` : ''}</td></tr>`).join('') + '</table>';
  enlazarAcciones(c, cargarAgenda);
}
$('#btnAgenda').onclick = cargarAgenda;

$('#fBloqueo').onsubmit = async e => {
  e.preventDefault(); const f = new FormData(e.target);
  const { error } = await sb.rpc('admin_bloquear_horario', { p_fecha: f.get('fecha'), p_hora: +f.get('hora'), p_horas: +f.get('horas'), p_motivo: f.get('motivo') });
  if (error) return toast(msgError(error), 'error');
  toast('Horario bloqueado'); cargarAgenda();
};

// ---------- usuarios ----------
async function cargarUsuarios() {
  const { data, error } = await sb.rpc('admin_usuarios', { p_buscar: $('#buscar').value.trim() });
  if (error) return toast(msgError(error), 'error');
  const c = $('#tablaUsuarios');
  if (!data.length) { c.innerHTML = '<div class="vacio">Sin resultados.</div>'; return; }
  c.innerHTML = `<table><tr><th>Nombre</th><th>DNI</th><th>Contacto</th><th>Reservas</th><th>Estado</th><th></th></tr>` + data.map(u => `
    <tr><td>${esc(u.nombre)}${u.rol === 'admin' ? ' <span class="chip azul">ADMIN</span>' : ''}</td><td>${esc(u.dni)}</td>
    <td>${esc(u.celular)}<br><span class="nota">${esc(u.email)}</span></td><td>${u.reservas_total}</td>
    <td>${u.bloqueado ? `<span class="chip rojo">Suspendido</span><br><span class="nota">${esc(u.motivo_bloqueo || '')}</span>` : '<span class="chip verde">Activo</span>'}</td>
    <td>${u.id === user.id ? '' : `
      <button class="btn chico ${u.bloqueado ? '' : 'rojo'}" data-susp="${u.id}" data-val="${!u.bloqueado}">${u.bloqueado ? 'Reactivar' : 'Suspender'}</button>
      <button class="btn chico sec" data-rol="${u.id}" data-val="${u.rol === 'admin' ? 'usuario' : 'admin'}">${u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}</button>
      ${u.rol === 'admin' ? '' : `<button class="btn chico azul" data-cod="${u.id}" data-nombre="${esc(u.nombre)}" data-cel="${esc(u.celular)}" title="Para quien olvidó su contraseña. Verifica antes su DNI.">Código de recuperación</button>
      <button class="btn chico sec" data-elim="${u.id}" title="Borra la cuenta. La persona podrá registrarse de nuevo con su DNI.">Eliminar cuenta</button>`}`}</td></tr>`).join('') + '</table>';
  $$('[data-cod]', c).forEach(b => b.onclick = async () => {
    if (!confirm(`¿Verificaste el DNI de ${b.dataset.nombre}? Se generará un código de un solo uso válido por 30 minutos.`)) return;
    const { data, error } = await sb.rpc('admin_generar_codigo', { p_usuario: b.dataset.cod });
    if (error) return toast(msgError(error), 'error');
    $('#codPara').innerHTML = `Para: <b>${esc(b.dataset.nombre)}</b> · Cel. ${esc(b.dataset.cel)}`;
    $('#codValor').textContent = data;
    $('#btnCopiarCod').onclick = () => { navigator.clipboard?.writeText(data); toast('Código copiado'); };
    $('#btnWaCod').href = enlaceWhatsApp(b.dataset.cel, `Hola ${b.dataset.nombre.split(' ')[0]}, tu código de recuperación de la Cancha Grass EMICOH es: ${data}\nVence en 30 minutos y sirve una sola vez. Entra a https://emicoh.github.io/cancha/ → Ingresar → ¿Olvidaste tu contraseña? No compartas este código con nadie.`);
    abrirModal('#mCodigo');
  });
  $$('[data-elim]', c).forEach(b => b.onclick = async () => {
    if (!confirm('¿Eliminar esta cuenta? Sus reservas pendientes se cancelan y la persona podrá registrarse de nuevo con su DNI. No se puede deshacer.')) return;
    const { error } = await sb.rpc('admin_eliminar_cuenta', { p_usuario: b.dataset.elim });
    if (error) return toast(msgError(error), 'error');
    toast('Cuenta eliminada'); cargarUsuarios();
  });
  $$('[data-susp]', c).forEach(b => b.onclick = async () => {
    const bloquear = b.dataset.val === 'true';
    const motivo = bloquear ? prompt('Motivo de la suspensión:', 'Incumplimiento del reglamento') : null;
    if (bloquear && !motivo) return;
    const { error } = await sb.rpc('admin_bloquear_usuario', { p_usuario: b.dataset.susp, p_bloquear: bloquear, p_motivo: motivo });
    if (error) return toast(msgError(error), 'error');
    toast(bloquear ? 'Usuario suspendido' : 'Usuario reactivado'); cargarUsuarios();
  });
  $$('[data-rol]', c).forEach(b => b.onclick = async () => {
    if (!confirm(b.dataset.val === 'admin' ? '¿Dar permisos de administrador a esta persona?' : '¿Quitar permisos de administrador?')) return;
    const { error } = await sb.rpc('admin_cambiar_rol', { p_usuario: b.dataset.rol, p_rol: b.dataset.val });
    if (error) return toast(msgError(error), 'error');
    toast('Rol actualizado'); cargarUsuarios();
  });
}
$('#btnBuscar').onclick = cargarUsuarios;

// ---------- configuración ----------
async function cargarConfig() {
  const { data, error } = await sb.from('config').select('*').eq('id', 1).single();
  if (error) return toast(msgError(error), 'error');
  const f = $('#fConfig');
  for (const [k, v] of Object.entries(data)) {
    const el = f.elements[k]; if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
  }
}
$('#fConfig').onsubmit = async e => {
  e.preventDefault(); const f = e.target, p = {};
  for (const el of f.elements) if (el.name) p[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  const { error } = await sb.rpc('admin_guardar_config', { p });
  if (error) return toast(msgError(error), 'error');
  toast('Configuración guardada');
};

// ---------- seguridad (bitácora) ----------
const ACCIONES = {
  'cuenta:registro': '🆕 Nueva cuenta', 'cuenta:eliminada': '🗑️ Cuenta eliminada', 'cuenta:suspendida': '⛔ Cuenta suspendida',
  'cuenta:reactivada': '✅ Cuenta reactivada', 'cuenta:rol_admin': '⭐ Se dio rol de administrador', 'cuenta:rol_usuario': '↩️ Se quitó rol de administrador',
  'recuperacion:codigo_emitido': '🔑 Código de recuperación emitido', 'recuperacion:clave_cambiada': '🔓 Cuenta recuperada con código',
  'recuperacion:fallida': '⚠️ Intento de recuperación fallido', 'clave:cambiada': '🔐 Contraseña cambiada', 'clave:actual_incorrecta': '⚠️ Contraseña actual incorrecta al cambiarla',
  'config:guardada': '⚙️ Configuración guardada',
};
const ESTADOS_TXT = { pendiente_pago: 'separada (pendiente de pago)', por_verificar: 'pago enviado', confirmada: 'confirmada', rechazada: 'rechazada', cancelada: 'cancelada', expirada: 'vencida sin pago' };
function textoAccion(a) {
  if (ACCIONES[a]) return ACCIONES[a];
  const [tipo, estado] = a.split(':');
  return (tipo === 'bloqueo' ? '🚧 Bloqueo de horario: ' : '📅 Reserva: ') + (ESTADOS_TXT[estado] || estado);
}
function detalleTexto(b) {
  const d = b.detalle || {};
  if (d.reserva) return `${d.fecha ? esc(fechaLarga(d.fecha)) + ' ' + hh(d.hora) : ''}${d.monto ? ' · ' + soles(d.monto) : ''}${d.metodo ? ' ' + esc(String(d.metodo).toUpperCase()) : ''}${d.nota ? '<br><span class="nota">' + esc(d.nota) + '</span>' : ''}`;
  if (b.accion === 'config:guardada') return `Abiertas: ${d.abierto ? 'sí' : 'no'} · Día ${soles(d.precio_dia)} · Noche ${soles(d.precio_noche)}`;
  if (d.motivo) return esc(d.motivo);
  return '';
}
async function cargarBitacora() {
  const { data, error } = await sb.rpc('admin_bitacora', { p_limite: 300 });
  if (error) return toast(msgError(error), 'error');
  const f = $('#filtroBit').value;
  const filas = data.filter(b => !f || b.accion.startsWith(f) || (f === 'reserva' && b.accion.startsWith('bloqueo')));
  const c = $('#tablaBitacora');
  if (!filas.length) { c.innerHTML = '<div class="vacio">Sin eventos.</div>'; return; }
  c.innerHTML = `<table><tr><th>Fecha</th><th>Evento</th><th>Hecho por</th><th>Cuenta</th><th>Detalle</th></tr>` + filas.map(b => `
    <tr${/fallida|incorrecta/.test(b.accion) ? ' style="background:#fff6f6"' : ''}><td style="white-space:nowrap">${esc(horaDe(b.fecha))}</td><td>${esc(textoAccion(b.accion))}</td>
    <td>${esc(b.actor)}</td><td>${esc(b.afectado || '')}</td><td>${detalleTexto(b)}</td></tr>`).join('') + '</table>';
}
$('#btnBitacora').onclick = cargarBitacora;
$('#filtroBit').onchange = cargarBitacora;

document.addEventListener('click', e => { const c = e.target.closest('[data-cerrar]'); if (c) cerrarModal(c.dataset.cerrar); });
iniciar();
