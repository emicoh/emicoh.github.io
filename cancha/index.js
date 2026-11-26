import {
  sb, $, $$, esc, hoyLima, horaLima, horasHasta, fechaCorta, fechaLarga, hh, soles, horaDe, chipEstado, msgError, toast,
  abrirModal, cerrarModal, prepararImagen, enlaceWhatsApp, mantenerSesion, fijarMantener, correoRecordado, recordarCorreo,
  claveValida, mejorarClaves, ocultarClaves, esperaIngreso, ingresoFallido, ingresoCorrecto
} from './comun.js?v=3';

let cfg = null, user = null, perfil = null;
let fechaSel = hoyLima(), horaSel = null, metodoSel = null, ocupacion = {}, pendienteTrasLogin = false;
let reloj = null;

mejorarClaves();

// ---------- carga inicial ----------
async function cargarConfig() {
  const { data, error } = await sb.from('config').select('*').eq('id', 1).single();
  if (error) { toast('No se pudo cargar la información. Recarga la página.', 'error'); return; }
  cfg = data;
  $('#nombreCancha').textContent = cfg.nombre_cancha;
  $('#precios').innerHTML =
    `<span>☀️ Día (${hh(cfg.hora_apertura)}–${hh(cfg.hora_inicio_noche)}): <b>${soles(cfg.precio_dia)}</b>/hora</span>` +
    `<span>🌙 Noche (${hh(cfg.hora_inicio_noche)}–${hh(cfg.hora_cierre)}): <b>${soles(cfg.precio_noche)}</b>/hora</span>`;
  $('#reglamento').textContent = cfg.reglamento || '';
  $('#contactoAdmin').textContent = cfg.whatsapp_admin ? 'Consultas: WhatsApp ' + cfg.whatsapp_admin : '';
  const av = $('#aviso');
  av.classList.add('oculto');
  if (!cfg.abierto) { av.textContent = '⚠️ Las reservas en línea están cerradas por el momento.' + (cfg.aviso ? ' ' + cfg.aviso : ''); av.classList.remove('oculto'); }
  else if (cfg.aviso) { av.textContent = cfg.aviso; av.classList.remove('oculto'); }
  $('[data-metodo=yape]').classList.toggle('oculto', !cfg.yape_numero);
  $('[data-metodo=plin]').classList.toggle('oculto', !cfg.plin_numero);
  const digitales = [cfg.yape_numero && 'Yape', cfg.plin_numero && 'Plin'].filter(Boolean);
  $('#notaPagos').textContent = cfg.abierto
    ? (digitales.length
      ? `Pagos: ${digitales.join(' o ')} (para cualquier horario) y efectivo en oficina (reservando con al menos 3 horas de anticipación).`
      : 'Por ahora solo se paga en efectivo en oficina, reservando con al menos 3 horas de anticipación.')
    : '';
  const dur = $('#duracion').value;
  $('#duracion').innerHTML = Array.from({ length: cfg.max_horas_por_reserva }, (_, i) =>
    `<option value="${i + 1}">${i + 1} hora${i ? 's' : ''}</option>`).join('');
  if (dur && dur <= cfg.max_horas_por_reserva) $('#duracion').value = dur;
  const wa = enlaceWhatsApp(cfg.whatsapp_admin, 'Hola, olvidé mi contraseña de la Cancha Grass. Mi DNI es: ');
  $('#btnPedirCodigo').classList.toggle('oculto', !wa);
  if (wa) $('#btnPedirCodigo').href = wa;
  pintarDias();
}

function pintarDias() {
  const cont = $('#dias'); cont.innerHTML = '';
  for (let i = 0; i <= cfg.dias_anticipacion; i++) {
    const iso = hoyLima(i), f = fechaCorta(iso);
    const b = document.createElement('button');
    b.className = 'dia' + (iso === fechaSel ? ' sel' : '');
    b.innerHTML = `<small>${i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : f.dia}</small><b>${f.num}</b><small>${f.mes}</small>`;
    b.onclick = () => { fechaSel = iso; horaSel = null; $$('.dia').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); pintarHoras(); actualizarResumen(); };
    cont.appendChild(b);
  }
}

async function cargarOcupacion() {
  if (!cfg) return;
  const { data, error } = await sb.rpc('disponibilidad', { p_desde: hoyLima(), p_hasta: hoyLima(cfg.dias_anticipacion) });
  if (error) { toast(msgError(error), 'error'); return; }
  ocupacion = {};
  for (const r of data) for (let h = r.hora_inicio; h < r.hora_inicio + r.horas; h++) {
    const k = r.fecha + '|' + h, peso = { bloqueado: 3, ocupado: 2, separado: 1 };
    if (!ocupacion[k] || peso[r.estado] > peso[ocupacion[k]]) ocupacion[k] = r.estado;
  }
  pintarHoras();
}

function estadoHora(fecha, h) {
  if (fecha === hoyLima() && h <= horaLima() + 0.5) return 'pasado';
  return ocupacion[fecha + '|' + h] || 'libre';
}

function pintarHoras() {
  const cont = $('#horas'); cont.innerHTML = '';
  for (let h = cfg.hora_apertura; h < cfg.hora_cierre; h++) {
    const est = estadoHora(fechaSel, h);
    const precio = h >= cfg.hora_inicio_noche ? cfg.precio_noche : cfg.precio_dia;
    const b = document.createElement('button');
    const dur = +$('#duracion').value || 1;
    const enSel = horaSel !== null && h >= horaSel && h < horaSel + dur;
    b.className = 'hora ' + est + (enSel ? ' sel' : '');
    b.disabled = est !== 'libre' || !cfg.abierto;
    const etiqueta = { libre: soles(precio), separado: 'Separado', ocupado: 'Ocupado', bloqueado: 'No disponible', pasado: 'Pasó' }[est];
    b.innerHTML = `<b>${hh(h)}</b><small>${etiqueta}</small>`;
    b.onclick = () => { horaSel = h; pintarHoras(); actualizarResumen(); };
    cont.appendChild(b);
  }
}

function calcular() {
  if (horaSel === null) return null;
  const dur = +$('#duracion').value;
  if (horaSel + dur > cfg.hora_cierre) return { error: 'Supera la hora de cierre (' + hh(cfg.hora_cierre) + ')' };
  let monto = 0;
  for (let h = horaSel; h < horaSel + dur; h++) {
    if (estadoHora(fechaSel, h) !== 'libre') return { error: 'Las ' + hh(h) + ' no están libres. Elige menos horas u otro horario.' };
    monto += +(h >= cfg.hora_inicio_noche ? cfg.precio_noche : cfg.precio_dia);
  }
  return { dur, monto };
}

// Medios de pago posibles para el horario elegido
function metodosPosibles() {
  const faltan = horasHasta(fechaSel, horaSel);
  return {
    yape: !!cfg.yape_numero,
    plin: !!cfg.plin_numero,
    efectivo: faltan >= 3.05,
  };
}

function actualizarResumen() {
  const c = calcular(), btn = $('#btnReservar'), t = $('#txtResumen');
  t.style.color = '';
  if (!c) { t.textContent = 'Selecciona una hora libre'; btn.disabled = true; return; }
  if (c.error) { t.textContent = c.error; t.style.color = 'var(--rojo)'; btn.disabled = true; return; }
  const m = metodosPosibles();
  if (!m.yape && !m.plin && !m.efectivo) {
    t.innerHTML = `${esc(fechaLarga(fechaSel))} · ${hh(horaSel)}<br>Para pagar en efectivo debes reservar con al menos 3 horas de anticipación. Elige un horario más tarde u otro día.`;
    t.style.color = 'var(--rojo)'; btn.disabled = true; return;
  }
  t.innerHTML = `${esc(fechaLarga(fechaSel))} · ${hh(horaSel)} a ${hh(horaSel + c.dur)} · <b>${soles(c.monto)}</b>`;
  btn.disabled = !cfg.abierto;
}
$('#duracion').onchange = () => { pintarHoras(); actualizarResumen(); };

// ---------- sesión ----------
async function cargarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  user = session?.user || null;
  perfil = null;
  if (user) {
    const { data } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
    perfil = data;
  }
  pintarUsuario();
  if (user) cargarMisReservas(); else $('#panelMis').classList.add('oculto');
}

function pintarUsuario() {
  const z = $('#zonaUsuario');
  if (!user) { z.innerHTML = '<button class="btn chico" id="btnIngresar">Ingresar</button>'; $('#btnIngresar').onclick = () => abrirAuth(); return; }
  const nombre = perfil ? perfil.nombres.split(' ')[0] : 'Usuario';
  z.innerHTML = `<button class="btn chico usuario-btn" id="btnCuenta" title="Mi cuenta">👤 ${esc(nombre)}</button>` +
    (perfil?.rol === 'admin' ? '<a class="btn chico azul" href="admin.html">Panel admin</a>' : '') +
    '<button class="btn chico sec" id="btnSalir">Salir</button>';
  $('#btnCuenta').onclick = abrirCuenta;
  $('#btnSalir').onclick = salir;
}

async function salir() {
  await sb.auth.signOut({ scope: 'local' });
  cerrarModal('#mCuenta'); toast('Sesión cerrada');
}

function abrirAuth(motivo) {
  $('#authMotivo').textContent = motivo || 'Ingresa o crea tu cuenta para separar la cancha.';
  $('#lgMantener').checked = mantenerSesion();
  const f = $('#fLogin');
  if (!f.email.value) f.email.value = correoRecordado();
  abrirModal('#mAuth');
  pintarEspera();
  setTimeout(() => (f.email.value ? f.password : f.email).focus(), 50);
}
$$('[data-tab]').forEach(b => b.onclick = () => {
  $$('[data-tab]').forEach(x => x.classList.toggle('act', x === b));
  $('#fLogin').classList.toggle('oculto', b.dataset.tab !== 'login');
  $('#fRegistro').classList.toggle('oculto', b.dataset.tab !== 'registro');
});

async function enviando(form, fn) {
  form.classList.add('cargando');
  try { await fn(); } catch (e) { toast(msgError(e), 'error'); } finally { form.classList.remove('cargando'); }
}

// Validación con mensajes en español
function revisar(form) {
  for (const el of form.elements) {
    if (!el.name || el.type === 'hidden' || el.closest('.oculto')) continue;
    if (!el.checkValidity()) {
      el.focus();
      let lab = (el.closest('.clave') || el).previousElementSibling;
      while (lab && lab.tagName !== 'LABEL') lab = lab.previousElementSibling;
      const nombre = (lab?.textContent || 'este campo').trim();
      toast(el.type === 'checkbox' ? 'Debes aceptar para continuar.' : el.validity.valueMissing ? `Completa: ${nombre}` : `Revisa: ${nombre}${el.title ? ' (' + el.title + ')' : ''}`, 'error');
      return false;
    }
  }
  return true;
}

let relojEspera = null;
function pintarEspera() {
  clearInterval(relojEspera);
  const tick = () => {
    const s = esperaIngreso(), p = $('#lgEspera');
    $('#btnEntrar').disabled = s > 0;
    p.classList.toggle('oculto', !s);
    p.textContent = s ? `Demasiados intentos fallidos. Espera ${s} s para volver a intentar o recupera tu cuenta.` : '';
    if (!s) clearInterval(relojEspera);
  };
  tick(); relojEspera = setInterval(tick, 1000);
}

$('#fLogin').onsubmit = e => {
  e.preventDefault(); const form = e.target;
  if (!revisar(form)) return;
  if (esperaIngreso()) return pintarEspera();
  const email = form.email.value.trim(), password = form.password.value;
  enviando(form, async () => {
    fijarMantener($('#lgMantener').checked);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (/Invalid login credentials/i.test(error.message)) { ingresoFallido(); pintarEspera(); }
      throw error;
    }
    ingresoCorrecto(); recordarCorreo(email);
    cerrarModal('#mAuth'); form.password.value = ''; ocultarClaves(form); toast('¡Bienvenido!');
  });
};

$('#fRegistro').onsubmit = e => {
  e.preventDefault(); const form = e.target; const f = new FormData(form);
  if (!revisar(form)) return;
  if (!claveValida(f.get('password'))) return toast('La contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
  if (f.get('password') !== f.get('password2')) return toast('Las contraseñas no coinciden', 'error');
  enviando(form, async () => {
    fijarMantener(true);
    const email = f.get('email').trim();
    const { data, error } = await sb.auth.signUp({
      email, password: f.get('password'),
      options: { data: { dni: f.get('dni').trim(), nombres: f.get('nombres').trim(), apellidos: f.get('apellidos').trim(), celular: f.get('celular').trim() } }
    });
    if (error) throw error;
    recordarCorreo(email);
    if (!data.session) { toast('Cuenta creada. Ahora inicia sesión.'); $('[data-tab=login]').click(); $('#fLogin').email.value = email; return; }
    cerrarModal('#mAuth'); form.reset(); ocultarClaves(form); toast('¡Cuenta creada! Ya puedes separar la cancha.');
  });
};

// ---------- recuperar cuenta ----------
$('#lnkOlvide').onclick = e => {
  e.preventDefault();
  const fr = $('#fRecuperar');
  fr.email.value = $('#fLogin').email.value.trim() || correoRecordado();
  cerrarModal('#mAuth'); abrirModal('#mRecuperar');
};
$('#lnkOlvideCorreo').onclick = e => {
  e.preventDefault();
  toast('Tu usuario es el correo con el que te registraste. Si no lo recuerdas, la administración puede decírtelo después de verificar tu DNI' +
    (cfg?.whatsapp_admin ? ' (WhatsApp ' + cfg.whatsapp_admin + ').' : '.'));
};
$('#fRecuperar').codigo.addEventListener('input', e => {
  let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
  e.target.value = v;
});
$('#fRecuperar').onsubmit = e => {
  e.preventDefault(); const form = e.target;
  if (!revisar(form)) return;
  const email = form.email.value.trim(), codigo = form.codigo.value.trim(), clave = form.password.value;
  if (codigo.replace(/-/g, '').length !== 8) return toast('El código tiene 8 caracteres (XXXX-XXXX).', 'error');
  if (!claveValida(clave)) return toast('La contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
  if (clave !== form.password2.value) return toast('Las contraseñas no coinciden', 'error');
  enviando(form, async () => {
    const { data, error } = await sb.rpc('recuperar_cuenta', { p_email: email, p_codigo: codigo, p_nueva: clave });
    if (error) throw error;
    if (data === 'clave_debil') return toast('La contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
    if (data === 'espera') return toast('Demasiados intentos en este momento. Espera 10 minutos e inténtalo de nuevo.', 'error');
    if (data !== 'ok') return toast('El correo o el código no son correctos, o el código ya venció. Revisa o pide uno nuevo a la administración.', 'error');
    ingresoCorrecto();
    fijarMantener(true);
    const r = await sb.auth.signInWithPassword({ email, password: clave });
    form.reset(); ocultarClaves(form); cerrarModal('#mRecuperar');
    if (r.error) { toast('Contraseña cambiada. Ahora ingresa con tu nueva contraseña.'); abrirAuth('Ingresa con tu nueva contraseña.'); $('#fLogin').email.value = email; return; }
    recordarCorreo(email);
    toast('¡Listo! Recuperaste tu cuenta.');
  });
};

// Enlace de recuperación por correo (solo si en el futuro se configura el envío de correos)
$('#fReset').onsubmit = e => {
  e.preventDefault(); const form = e.target;
  if (!claveValida(form.password.value)) return toast('La contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
  enviando(form, async () => {
    const { error } = await sb.auth.updateUser({ password: form.password.value });
    if (error) throw error;
    cerrarModal('#mReset'); form.reset(); toast('Contraseña actualizada');
  });
};

// ---------- mi cuenta ----------
function abrirCuenta() {
  if (!user) return;
  const p = perfil || {};
  $('#misDatos').innerHTML =
    `<span>Nombre</span><b>${esc((p.nombres || '') + ' ' + (p.apellidos || ''))}</b>` +
    `<span>DNI</span><b>****${esc(String(p.dni || '').slice(-4))}</b>` +
    `<span>Celular</span><b>${esc(p.celular || '')}</b>` +
    `<span>Correo</span><b>${esc(user.email || '')}</b>` +
    `<span>Estado</span><b>${p.bloqueado ? '<span class="chip rojo">Suspendida</span>' : '<span class="estado-ok">Activa</span>'}</b>`;
  $('#fCambiar').email.value = user.email || '';
  $('#txtMantener').textContent = mantenerSesion()
    ? 'Tu sesión se mantiene iniciada en este dispositivo hasta que salgas.'
    : 'Tu sesión se cerrará al cerrar el navegador.';
  abrirModal('#mCuenta');
}
$('#fCambiar').onsubmit = e => {
  e.preventDefault(); const form = e.target;
  if (!revisar(form)) return;
  if (!claveValida(form.password.value)) return toast('La nueva contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
  if (form.password.value !== form.password2.value) return toast('Las contraseñas nuevas no coinciden', 'error');
  if (form.password.value === form.actual.value) return toast('La nueva contraseña debe ser diferente a la actual.', 'error');
  enviando(form, async () => {
    const { data, error } = await sb.rpc('cambiar_mi_clave', { p_actual: form.actual.value, p_nueva: form.password.value, p_cerrar_otras: form.cerrarOtras.checked });
    if (error) throw error;
    if (data === 'actual_incorrecta') return toast('La contraseña actual no es correcta.', 'error');
    if (data === 'clave_debil') return toast('La nueva contraseña debe tener al menos 8 caracteres, con letras y números.', 'error');
    if (data === 'espera') return toast('Demasiados intentos. Espera 15 minutos.', 'error');
    form.actual.value = form.password.value = form.password2.value = ''; ocultarClaves(form);
    cerrarModal('#mCuenta');
    toast(form.cerrarOtras.checked ? 'Contraseña cambiada. Cerramos tu sesión en los otros dispositivos.' : 'Contraseña cambiada.');
  });
};
$('#btnSalirTodo').onclick = async () => {
  if (!confirm('¿Cerrar tu sesión en todos los dispositivos, incluido este?')) return;
  const { error } = await sb.auth.signOut({ scope: 'global' });
  if (error) await sb.auth.signOut({ scope: 'local' });
  cerrarModal('#mCuenta'); toast('Cerraste sesión en todos tus dispositivos');
};
$('#btnSalir2').onclick = salir;

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') abrirModal('#mReset');
  setTimeout(async () => {
    await cargarPerfil();
    if (pendienteTrasLogin && user) { pendienteTrasLogin = false; abrirConfirmar(); }
  }, 0);
});

// ---------- reservar ----------
$('#btnReservar').onclick = () => {
  if (!user) { pendienteTrasLogin = true; return abrirAuth('Para separar la cancha necesitas iniciar sesión o registrarte. Es rápido.'); }
  abrirConfirmar();
};

function abrirConfirmar() {
  const c = calcular(); if (!c || c.error) return;
  if (perfil?.bloqueado) return toast('Tu cuenta está suspendida. Comunícate con la administración.', 'error');
  const m = metodosPosibles();
  metodoSel = null; $$('.metodo').forEach(x => { x.classList.remove('sel'); x.disabled = !m[x.dataset.metodo]; });
  $('#cfEfSub').textContent = m.efectivo ? 'En oficina' : 'Solo con 3 h de anticipación';
  const avisos = [];
  if (!cfg.yape_numero && !cfg.plin_numero) avisos.push('Yape y Plin todavía no están habilitados.');
  if (!m.efectivo) avisos.push('Para pagar en efectivo debes reservar con al menos 3 horas de anticipación.');
  $('#cfAvisoMetodos').textContent = avisos.join(' ');
  $('#btnConfirmar').disabled = true; $('#cfNota').textContent = '';
  $('#cfTexto').textContent = `${fechaLarga(fechaSel)} · ${hh(horaSel)} a ${hh(horaSel + c.dur)}`;
  $('#cfMonto').textContent = soles(c.monto);
  const unico = Object.keys(m).filter(k => m[k]);
  abrirModal('#mConfirmar');
  if (unico.length === 1) $(`[data-metodo=${unico[0]}]`).click();
}
$$('.metodo').forEach(m => m.onclick = () => {
  if (m.disabled) return;
  metodoSel = m.dataset.metodo;
  $$('.metodo').forEach(x => x.classList.toggle('sel', x === m));
  $('#cfNota').textContent = metodoSel === 'efectivo'
    ? `Tendrás un plazo (máximo ${cfg.horas_para_pagar_efectivo} h y hasta 1 h antes del partido; si es tu primera reserva, máximo 3 h) para pagar en: ${cfg.lugar_pago_efectivo}. Si no pagas, se libera el horario.`
    : `Tendrás ${cfg.minutos_para_pagar} minutos para pagar y enviar tu número de operación con la captura. Si no, se libera el horario.`;
  $('#btnConfirmar').disabled = false;
});
$('#btnConfirmar').onclick = async () => {
  const c = calcular(); const btn = $('#btnConfirmar');
  if (!c || c.error || !metodoSel) return;
  btn.disabled = true;
  const { data: id, error } = await sb.rpc('crear_reserva', { p_fecha: fechaSel, p_hora: horaSel, p_horas: c.dur, p_metodo: metodoSel });
  btn.disabled = false;
  if (error) { toast(msgError(error), 'error'); cargarOcupacion(); return; }
  cerrarModal('#mConfirmar'); horaSel = null; actualizarResumen();
  await cargarOcupacion(); await cargarMisReservas();
  abrirPago(id);
};

// ---------- pago ----------
async function abrirPago(id) {
  const { data: r, error } = await sb.from('reservas').select('*').eq('id', id).single();
  if (error) return toast(msgError(error), 'error');
  clearInterval(reloj);
  const cont = $('#pgContenido');
  const cab = `<div class="pago-box"><div>${esc(fechaLarga(r.fecha))} · ${hh(r.hora_inicio)} a ${hh(r.hora_inicio + r.horas)}</div><div class="monto">${soles(r.monto)}</div>${chipEstado(r.estado)}</div>`;
  if (r.metodo === 'efectivo') {
    $('#pgTitulo').textContent = 'Pago en efectivo';
    cont.innerHTML = cab + `<p>Acércate a pagar <b>${soles(r.monto)}</b> en:</p><p><b>${esc(cfg.lugar_pago_efectivo)}</b></p>
      <p class="nota">Plazo: hasta el <b>${esc(horaDe(r.vence_en))}</b>. Si no pagas antes, el horario se libera.<br>Lleva tu DNI. Al pagar, la administración confirmará tu reserva.</p>
      <button class="btn full" style="margin-top:14px" data-cerrar="#mPago">Entendido</button>`;
  } else {
    const esYape = r.metodo === 'yape';
    const num = esYape ? cfg.yape_numero : cfg.plin_numero, tit = esYape ? cfg.yape_titular : cfg.plin_titular;
    $('#pgTitulo').textContent = 'Paga con ' + (esYape ? 'Yape' : 'Plin');
    cont.innerHTML = cab + `
      <div class="pago-box"><div class="nota">Envía exactamente <b>${soles(r.monto)}</b> al número</div>
        <div class="num">${esc(num || 'Por configurar')}</div><div>${esc(tit || '')}</div>
        ${num ? `<button class="btn chico sec" id="btnCopiar" style="margin-top:8px">Copiar número</button>` : ''}</div>
      <p class="nota">🔒 Paga solo a este número que ves en la página. Desconfía de números enviados por mensaje.</p>
      <p class="nota">Tiempo para pagar: <span class="cuenta" id="cuenta"></span></p>
      <form id="fPago">
        <label>Número de operación (aparece en tu ${esYape ? 'Yape' : 'Plin'})</label>
        <input name="nro" required inputmode="numeric" pattern="\\d{4,20}" maxlength="20" placeholder="Ej. 12345678" autocomplete="off">
        <label>Captura del pago</label>
        <input name="foto" type="file" accept="image/*" required>
        <button class="btn full" style="margin-top:16px">Enviar comprobante</button>
        <p class="nota">La administración verificará tu pago y confirmará la reserva. Recibirás el estado en "Mis reservas".</p>
      </form>`;
    if (num) $('#btnCopiar').onclick = e => { e.preventDefault(); navigator.clipboard?.writeText(num); toast('Número copiado'); };
    const fin = new Date(r.vence_en).getTime();
    const tick = () => {
      const s = Math.max(0, Math.floor((fin - Date.now()) / 1000));
      const el = $('#cuenta'); if (!el) return clearInterval(reloj);
      el.textContent = s ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : 'Vencido';
      if (!s) clearInterval(reloj);
    };
    tick(); reloj = setInterval(tick, 1000);
    $('#fPago').onsubmit = e => {
      e.preventDefault(); const form = e.target; const f = new FormData(form);
      if (!/^\d{4,20}$/.test(String(f.get('nro')).trim())) return toast('El número de operación debe tener solo números (4 a 20 dígitos).', 'error');
      enviando(form, async () => {
        const img = await prepararImagen(f.get('foto'));
        const ruta = `${user.id}/reserva-${r.id}-${Date.now()}.${img.ext}`;
        const up = await sb.storage.from('comprobantes').upload(ruta, img.blob, { contentType: img.type, upsert: false });
        if (up.error) throw up.error;
        const { error } = await sb.rpc('enviar_pago', { p_id: r.id, p_nro_operacion: String(f.get('nro')).trim(), p_comprobante: ruta });
        if (error) throw error;
        clearInterval(reloj); cerrarModal('#mPago');
        toast('¡Comprobante enviado! Te confirmaremos pronto.');
        cargarMisReservas(); cargarOcupacion();
      });
    };
  }
  abrirModal('#mPago');
}

// ---------- mis reservas ----------
async function cargarMisReservas() {
  if (!user) return;
  const { data, error } = await sb.from('reservas').select('*').eq('usuario_id', user.id).eq('tipo', 'reserva')
    .order('fecha', { ascending: false }).order('hora_inicio', { ascending: false }).limit(30);
  if (error) return;
  $('#panelMis').classList.remove('oculto');
  const cont = $('#misReservas');
  if (!data.length) { cont.innerHTML = '<div class="vacio">Aún no tienes reservas.</div>'; return; }
  cont.innerHTML = data.map(r => `
    <div class="item">
      <div class="top"><div><b>${esc(fechaLarga(r.fecha))}</b> · ${hh(r.hora_inicio)} a ${hh(r.hora_inicio + r.horas)}<br>
        <span class="nota">${soles(r.monto)} · ${esc((r.metodo || '').toUpperCase())}${r.nro_operacion ? ' · Op. ' + esc(r.nro_operacion) : ''}</span></div>
        ${chipEstado(r.estado)}</div>
      ${r.nota_admin ? `<p class="nota">Nota de administración: ${esc(r.nota_admin)}</p>` : ''}
      ${r.estado === 'pendiente_pago' && r.vence_en ? `<p class="nota">Paga antes de: <b>${esc(horaDe(r.vence_en))}</b></p>` : ''}
      <div class="acciones">
        ${r.estado === 'pendiente_pago' ? `<button class="btn chico" data-pagar="${r.id}">${r.metodo === 'efectivo' ? 'Ver dónde pagar' : 'Pagar ahora'}</button>` : ''}
        ${['pendiente_pago', 'por_verificar', 'confirmada'].includes(r.estado) ? `<button class="btn chico sec" data-cancelar="${r.id}">Cancelar</button>` : ''}
      </div>
    </div>`).join('');
  $$('[data-pagar]').forEach(b => b.onclick = () => abrirPago(+b.dataset.pagar));
  $$('[data-cancelar]').forEach(b => b.onclick = async () => {
    if (!confirm('¿Seguro que quieres cancelar esta reserva? Si ya pagaste, la devolución se coordina con la administración. Cancelar varias separaciones sin pagar bloquea nuevas reservas por 24 horas.')) return;
    const { error } = await sb.rpc('cancelar_reserva', { p_id: +b.dataset.cancelar });
    if (error) return toast(msgError(error), 'error');
    toast('Reserva cancelada'); cargarMisReservas(); cargarOcupacion();
  });
}

// ---------- general ----------
document.addEventListener('click', e => {
  const c = e.target.closest('[data-cerrar]');
  if (c) { e.preventDefault(); cerrarModal(c.dataset.cerrar); ocultarClaves($(c.dataset.cerrar)); clearInterval(reloj); }
  const p = e.target.closest('.irPrivacidad, #lnkPrivacidad');
  if (p) { e.preventDefault(); $$('.modal.abierto').forEach(m => cerrarModal('#' + m.id)); $('#privacidad').open = true; $('#privacidad').scrollIntoView({ behavior: 'smooth' }); }
});
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'mReset') { cerrarModal('#' + m.id); ocultarClaves(m); clearInterval(reloj); } }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('.modal.abierto'); if (m && m.id !== 'mReset') { cerrarModal('#' + m.id); ocultarClaves(m); } } });

await cargarConfig();
await cargarOcupacion();
setInterval(cargarOcupacion, 60000);
setInterval(async () => { await cargarConfig(); pintarHoras(); actualizarResumen(); }, 5 * 60000);
