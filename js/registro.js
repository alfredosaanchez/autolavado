const CARACAS_TIME_ZONE = 'America/Caracas';
/* =========================================================
   registro.js — lógica de la página principal de registro
   ========================================================= */

let awDrinkCounts = {}; // { itemId: cantidad }
let awServiciosCache = [];
let awLavadoresCache = [];
let awBebidasSnacksCache = [];
let awInventarioCache = [];
let awTasaCache = 1;
let awTicketsHoyCache = [];
let awPeriquitoRowCounter = 0;
let awPerfilActual = null;
let awSucursalActivaId = null;
let awSucursalesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  const licencia = await awVerificarLicencia();
  if (licencia.bloqueado) {
    document.getElementById('licenciaMensajeTxt').textContent = licencia.mensaje;
    document.getElementById('licenciaBloqueo').style.display = 'flex';
    return;
  }
  if (licencia.aviso) {
    const dias = licencia.diasRestantes;
    const banner = document.getElementById('licenciaAviso');
    banner.textContent = dias <= 0
      ? '⚠️ El sistema se desactivará hoy si no se renueva.'
      : `⚠️ Quedan ${dias} día${dias === 1 ? '' : 's'} para que el sistema se desactive.`;
    banner.style.display = 'block';
  }

  bindLoginForm();
  bindRegistroForm();
  bindModeSwitchLinks();
  bindLogoutButton();
  bindPasswordToggle();
  awSupabase.auth.onAuthStateChange((_event, session) => {
    if (session) resolverSesion(session);
    else mostrarPantallaLogin();
  });
  awSupabase.auth.getSession().then(({ data: { session } }) => {
    if (session) resolverSesion(session);
    else mostrarPantallaLogin();
  });
});

/* ---------- Cambiar entre modo Login / Registro / Registrado-OK ---------- */
function bindModeSwitchLinks() {
  document.getElementById('linkIrRegistro').addEventListener('click', (e) => {
    e.preventDefault();
    mostrarModoLogin('registro');
  });
  document.getElementById('linkIrLogin').addEventListener('click', (e) => {
    e.preventDefault();
    mostrarModoLogin('login');
  });
  document.getElementById('btnVolverLoginDesdeOk').addEventListener('click', () => mostrarModoLogin('login'));
}

function mostrarModoLogin(modo) {
  document.getElementById('loginModeLogin').style.display = modo === 'login' ? 'block' : 'none';
  document.getElementById('loginModeRegistro').style.display = modo === 'registro' ? 'block' : 'none';
  document.getElementById('loginModeRegistroOk').style.display = modo === 'ok' ? 'block' : 'none';
}

/* ---------- Login ---------- */
function bindPasswordToggle() {
  const btn = document.getElementById('toggleLoginPassword');
  const input = document.getElementById('loginPassword');
  btn.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? '👁️' : '🙈';
    btn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });
}

function bindLoginForm() {
  document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn');
    const errorMsg = document.getElementById('loginError');
    errorMsg.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Entrando…';

    const { error } = await awSupabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = 'Entrar';
    if (error) {
      errorMsg.textContent = 'Usuario o contraseña incorrectos.';
    }
  });
}

/* ---------- Registro de cuenta (autoregistro, queda pendiente de aprobación) ---------- */
function bindRegistroForm() {
  document.getElementById('form-registro-usuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('registroEmail').value.trim();
    const password = document.getElementById('registroPassword').value;
    const btn = document.getElementById('registroBtn');
    const errorMsg = document.getElementById('registroError');
    errorMsg.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Creando…';

    const { error } = await awSupabase.auth.signUp({ email, password });

    btn.disabled = false;
    btn.textContent = 'Crear cuenta';
    if (error) {
      errorMsg.textContent = error.message === 'User already registered'
        ? 'Ese correo ya tiene una cuenta.'
        : 'No se pudo crear la cuenta. Intenta de nuevo.';
      return;
    }
    document.getElementById('form-registro-usuario').reset();
    mostrarModoLogin('ok');
  });
}

function bindLogoutButton() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await awSupabase.auth.signOut();
  });
  document.getElementById('btnCerrarSesionPendiente').addEventListener('click', async () => {
    await awSupabase.auth.signOut();
  });
}

/* ---------- Resolver sesión ---------- */
async function resolverSesion(session) {
  const perfil = await awGetMiPerfil();
  awPerfilActual = perfil;
  if (!perfil || perfil.estado !== 'activo') {
    mostrarPantallaPendiente(perfil);
    return;
  }
  await mostrarFormularioRegistro(session, perfil);
}

function mostrarPantallaLogin() {
  awPerfilActual = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('pendingScreen').style.display = 'none';
  document.getElementById('registroContent').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutEmail').style.display = 'none';
  mostrarModoLogin('login');
}

function mostrarPantallaPendiente(perfil) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('pendingScreen').style.display = 'flex';
  document.getElementById('registroContent').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutEmail').style.display = 'none';
  const msgEl = document.querySelector('#pendingScreen p.hint');
  if (perfil && perfil.estado === 'rechazado') {
    msgEl.textContent = 'Tu acceso fue rechazado. Contacta al Dueño si crees que es un error.';
  } else {
    msgEl.textContent = 'Tu acceso todavía no ha sido aprobado. Contacta al Dueño para que lo apruebe y te asigne sucursal.';
  }
}

/* ---------- Determinar sucursal activa y mostrar el formulario ---------- */
async function mostrarFormularioRegistro(session, perfil) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('pendingScreen').style.display = 'none';
  document.getElementById('registroContent').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  document.getElementById('logoutEmail').style.display = 'inline';
  document.getElementById('logoutEmail').textContent = `${session.user.email} (${AW_ROL_LABELS[perfil.rol] || perfil.rol})`;

  awSucursalesCache = await awGetSucursales();

  if (perfil.rol === 'cajero') {
    awSucursalActivaId = perfil.sucursal_id;
    const suc = awSucursalesCache.find(s => s.id === perfil.sucursal_id);
    document.getElementById('sucursalWidgetFijo').style.display = 'block';
    document.getElementById('sucursalFijaTxt').textContent = suc ? suc.nombre : 'Sin asignar';
    if (!perfil.sucursal_id) {
      document.getElementById('sucursalFijaTxt').textContent = 'Sin asignar — avisa al Dueño';
    }
  } else {
    const selSucursal = document.getElementById('sucursalSelect');
    document.getElementById('sucursalWidgetSelect').style.display = 'flex';
    selSucursal.innerHTML = awSucursalesCache.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
    const guardada = localStorage.getItem('aw_sucursal_activa');
    const existe = awSucursalesCache.some(s => s.id === guardada);
    awSucursalActivaId = existe ? guardada : (awSucursalesCache[0] ? awSucursalesCache[0].id : null);
    selSucursal.value = awSucursalActivaId || '';
    selSucursal.addEventListener('change', async () => {
      awSucursalActivaId = selSucursal.value;
      localStorage.setItem('aw_sucursal_activa', awSucursalActivaId);
      await cargarConfiguracion();
      await renderTickets();
    });
  }

  bindMetodoPago();
  bindServicioChange();
  document.getElementById('btnAddPeriquito').addEventListener('click', addPeriquitoFila);
  document.getElementById('form-registro').addEventListener('submit', onSubmitRegistro);
  document.getElementById('buscadorTickets').addEventListener('input', renderTicketsFiltrados);
  await cargarConfiguracion();
  await renderTickets();
}

/* ---------- Cargar servicios / lavadores / bebidas / tasa y poblar selects ---------- */
async function cargarConfiguracion() {
  const selLav = document.getElementById('lavadorSelect');
  selLav.innerHTML = '<option value="">Cargando…</option>';

  const [servicios, lavadores, bebidasSnacks, tasa, permitirFechaPasada, inventario] = await Promise.all([
    awGetServicios(awSucursalActivaId),
    awGetLavadores(awSucursalActivaId),
    awGetBebidasSnacks(awSucursalActivaId),
    awGetTasa(),
    awGetPermitirFechaPasada(),
    awGetInventario(awSucursalActivaId)
  ]);
  awServiciosCache = servicios;
  awLavadoresCache = lavadores;
  awBebidasSnacksCache = bebidasSnacks;
  awTasaCache = tasa;
  awInventarioCache = inventario;
  awDrinkCounts = {};
  bebidasSnacks.forEach(item => { awDrinkCounts[item.id] = 0; });

  document.getElementById('tasaDisplay').textContent = awFormatMoney(awTasaCache, 'Bs');
  document.getElementById('fechaPasadaSection').style.display = permitirFechaPasada ? 'block' : 'none';
  document.getElementById('periquitosFilas').innerHTML = '';
  document.getElementById('serviciosFilas').innerHTML = '';
  addServicioFila();

  selLav.innerHTML = lavadores.map(l =>
    `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`
  ).join('') || '<option value="">No hay lavadores configurados</option>';

  renderDrinkGrid();
  actualizarHintPrecio();
}

function renderDrinkGrid() {
  const grid = document.getElementById('drinkGrid');
  if (awBebidasSnacksCache.length === 0) {
    grid.innerHTML = `<div class="hint">No hay bebidas/snacks configurados en el panel admin todavía.</div>`;
    return;
  }
  grid.innerHTML = awBebidasSnacksCache.map(item => `
    <div class="drink-card">
      <div class="drink-label">${item.emoji} ${escapeHtml(item.nombre)}</div>
      <div class="stepper">
        <button type="button" data-drink="${item.id}" data-op="-">−</button>
        <span id="qty-${item.id}">0</span>
        <button type="button" data-drink="${item.id}" data-op="+">+</button>
      </div>
    </div>
  `).join('');
  bindDrinkSteppers();
}

/* ---------- Servicios de lavado (varios por ticket) ---------- */
let awServicioFilaCounter = 0;
function addServicioFila() {
  const id = `sv-${++awServicioFilaCounter}`;
  const cont = document.getElementById('serviciosFilas');
  const div = document.createElement('div');
  div.className = 'periquito-fila';
  div.dataset.filaId = id;
  const opciones = awServiciosCache.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}${s.descripcion ? ' — ' + escapeHtml(s.descripcion) : ''}</option>`).join('');
  div.innerHTML = `
    <div class="field">
      <label>Tipo de servicio</label>
      <select class="servicio-select-fila">
        <option value="">Selecciona…</option>
        ${opciones}
      </select>
    </div>
    <div class="field" style="max-width:180px; flex:none;">
      <label>🎟️ Cupón de descuento</label>
      <div style="display:flex; align-items:center; gap:5px;">
        <input type="number" class="servicio-cupon-porcentaje" min="0" max="100" step="1" value="" placeholder="0" style="width:78px;">
        <span style="font-size:.8rem;">% descuento</span>
      </div>
    </div>
    ${awServiciosCache.length === 0 ? '' : '<button type="button" class="btn-quitar-fila" title="Quitar">×</button>'}
  `;
  cont.appendChild(div);

  if (awServiciosCache.length === 0) {
    div.querySelector('.servicio-select-fila').innerHTML = '<option value="">No hay servicios configurados</option>';
  }

  div.querySelector('.servicio-select-fila').addEventListener('change', actualizarHintPrecio);
  const cuponPorcentaje = div.querySelector('.servicio-cupon-porcentaje');
  cuponPorcentaje.addEventListener('input', () => {
    let valor = parseFloat(cuponPorcentaje.value);
    if (Number.isNaN(valor)) valor = 0;
    valor = Math.max(0, Math.min(100, valor));
    cuponPorcentaje.value = valor === 0 ? '' : valor;
    actualizarHintPrecio();
  });
  const btnQuitar = div.querySelector('.btn-quitar-fila');
  if (btnQuitar) {
    btnQuitar.addEventListener('click', () => {
      if (document.querySelectorAll('#serviciosFilas .periquito-fila').length <= 1) return;
      div.remove();
      actualizarHintPrecio();
    });
  }
  actualizarHintPrecio();
}

function leerFilasServicios() {
  const filas = [];
  document.querySelectorAll('#serviciosFilas .periquito-fila').forEach(div => {
    const servicioId = div.querySelector('.servicio-select-fila').value;
    const s = awServiciosCache.find(x => x.id === servicioId);
    if (!s) return;
    let cuponPorcentaje = parseFloat(div.querySelector('.servicio-cupon-porcentaje').value);
    if (Number.isNaN(cuponPorcentaje)) cuponPorcentaje = 0;
    cuponPorcentaje = Math.max(0, Math.min(100, cuponPorcentaje));
    const factor = 1 - (cuponPorcentaje / 100);
    filas.push({
      id: s.id,
      nombre: s.nombre,
      precioUsd: s.precioUsd,
      precioBs: awPrecioBsEfectivo(s, awTasaCache),
      cuponAplicado: cuponPorcentaje > 0,
      cuponPorcentaje,
      precioUsdFinal: (s.precioUsd || 0) * factor,
      precioBsFinal: awPrecioBsEfectivo(s, awTasaCache) * factor
    });
  });
  return filas;
}

function bindServicioChange() {
  document.getElementById('btnAddServicioFila').addEventListener('click', addServicioFila);
}

/* ---------- Periquitos (artículos de inventario) ---------- */
function addPeriquitoFila() {
  const id = `pq-${++awPeriquitoRowCounter}`;
  const cont = document.getElementById('periquitosFilas');
  const div = document.createElement('div');
  div.className = 'periquito-fila';
  div.dataset.filaId = id;
  div.innerHTML = `
    <div class="field" style="position:relative;">
      <label>Artículo (busca por nombre o código)</label>
      <input type="text" class="periquito-buscar" data-selected-id="" placeholder="Ej: llavero, PER-001…" autocomplete="off">
      <div class="periquito-sugerencias"></div>
    </div>
    <div class="field qty">
      <label>Cantidad</label>
      <select class="periquito-cantidad" disabled><option value="1">1</option></select>
    </div>
    <button type="button" class="btn-quitar-fila" title="Quitar">×</button>
  `;
  cont.appendChild(div);

  const inputBuscar = div.querySelector('.periquito-buscar');
  const sugerenciasBox = div.querySelector('.periquito-sugerencias');
  const selCantidad = div.querySelector('.periquito-cantidad');

  if (awInventarioCache.length === 0) {
    inputBuscar.placeholder = 'No hay artículos en el inventario';
    inputBuscar.disabled = true;
  }

  inputBuscar.addEventListener('input', () => {
    inputBuscar.dataset.selectedId = '';
    selCantidad.disabled = true;
    renderSugerenciasPeriquito(inputBuscar, sugerenciasBox, selCantidad);
  });
  inputBuscar.addEventListener('focus', () => renderSugerenciasPeriquito(inputBuscar, sugerenciasBox, selCantidad));
  document.addEventListener('click', (e) => {
    if (!div.contains(e.target)) sugerenciasBox.style.display = 'none';
  });

  selCantidad.addEventListener('change', actualizarHintPrecio);
  div.querySelector('.btn-quitar-fila').addEventListener('click', () => {
    div.remove();
    actualizarHintPrecio();
  });
}

function renderSugerenciasPeriquito(inputBuscar, sugerenciasBox, selCantidad) {
  const q = inputBuscar.value.trim().toLowerCase();
  const disponibles = awInventarioCache.filter(it => it.cantidad > 0);
  const coincidencias = q
    ? disponibles.filter(it => it.codigo.toLowerCase().includes(q) || it.descripcion.toLowerCase().includes(q))
    : disponibles;

  if (coincidencias.length === 0) {
    sugerenciasBox.innerHTML = `<div class="periquito-sugerencia-vacia">Sin resultados</div>`;
    sugerenciasBox.style.display = 'block';
    return;
  }

  sugerenciasBox.innerHTML = coincidencias.slice(0, 8).map(it => `
    <div class="periquito-sugerencia" data-id="${it.id}">
      <strong>${escapeHtml(it.codigo)}</strong> — ${escapeHtml(it.descripcion)}
      <span>${awFormatMoney(it.precioVentaUsd, 'USD')} · stock: ${it.cantidad}</span>
    </div>
  `).join('');
  sugerenciasBox.style.display = 'block';

  sugerenciasBox.querySelectorAll('.periquito-sugerencia').forEach(el => {
    el.addEventListener('click', () => {
      const item = awInventarioCache.find(i => i.id === el.dataset.id);
      if (!item) return;
      inputBuscar.value = `${item.codigo} — ${item.descripcion}`;
      inputBuscar.dataset.selectedId = item.id;
      sugerenciasBox.style.display = 'none';
      selCantidad.disabled = false;
      actualizarOpcionesCantidadPorItem(item, selCantidad);
      actualizarHintPrecio();
    });
  });
}

function actualizarOpcionesCantidadPorItem(item, selCantidad) {
  const max = Math.max(Math.min(item.cantidad, 20), 1);
  const actual = parseInt(selCantidad.value, 10) || 1;
  selCantidad.innerHTML = Array.from({ length: max }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === actual ? 'selected' : ''}>${n}</option>`).join('');
}


function leerFilasPeriquitos() {
  const filas = [];
  document.querySelectorAll('#periquitosFilas .periquito-fila').forEach(div => {
    const itemId = div.querySelector('.periquito-buscar').dataset.selectedId;
    const cantidad = parseInt(div.querySelector('.periquito-cantidad').value, 10) || 0;
    const item = awInventarioCache.find(i => i.id === itemId);
    if (item && cantidad > 0) {
      filas.push({
        id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad,
        precioVentaUsd: item.precioVentaUsd, precioVentaBs: item.precioVentaUsd * awTasaCache
      });
    }
  });
  return filas;
}

/* ---------- Resumen de cobro (usa la tasa para que TODO cuadre en ambas monedas) ---------- */
function actualizarHintPrecio() {
  const tasa = awTasaCache || 1;

  const serviciosFilas = leerFilasServicios();
  const precioServiciosBs = serviciosFilas.reduce((sum, f) => sum + f.precioBsFinal, 0);
  const precioServiciosUsd = serviciosFilas.reduce((sum, f) => sum + f.precioUsdFinal, 0);

  const bebidasBs = awCalcularCostoBebidas(awDrinkCounts, 'Bs', awBebidasSnacksCache, tasa);
  const bebidasUsd = awCalcularCostoBebidas(awDrinkCounts, 'USD', awBebidasSnacksCache, tasa);

  const periquitosFilas = leerFilasPeriquitos();
  const periquitosBs = periquitosFilas.reduce((s, f) => s + f.cantidad * f.precioVentaBs, 0);
  const periquitosUsd = periquitosFilas.reduce((s, f) => s + f.cantidad * f.precioVentaUsd, 0);

  const totalBs = precioServiciosBs + bebidasBs + periquitosBs;
  const totalUsd = precioServiciosUsd + bebidasUsd + periquitosUsd;

  document.getElementById('resumenServicioTxt').textContent = serviciosFilas.length > 0
    ? serviciosFilas.map(f => `${f.nombre}${f.cuponAplicado ? ` 🎟️-${f.cuponPorcentaje ?? 50}%` : ''}`).join(', ') + ` — ${awFormatMoney(precioServiciosBs, 'Bs')} / ${awFormatMoney(precioServiciosUsd, 'USD')}`
    : 'Sin servicios';

  const bebidasLinea = document.getElementById('resumenBebidasLinea');
  const bebidasHayAlguna = Object.values(awDrinkCounts).some(v => v > 0);
  if (bebidasHayAlguna) {
    const detalle = awBebidasSnacksCache
      .filter(item => (awDrinkCounts[item.id] || 0) > 0)
      .map(item => `${awDrinkCounts[item.id]}× ${item.emoji} ${item.nombre}`)
      .join(', ');
    document.getElementById('resumenBebidasTxt').textContent = `${detalle} — ${awFormatMoney(bebidasBs, 'Bs')} / ${awFormatMoney(bebidasUsd, 'USD')}`;
    bebidasLinea.style.display = 'flex';
  } else {
    bebidasLinea.style.display = 'none';
  }

  const periquitosLinea = document.getElementById('resumenPeriquitosLinea');
  if (periquitosFilas.length > 0) {
    const detalle = periquitosFilas.map(f => `${f.cantidad}× ${f.codigo}`).join(', ');
    document.getElementById('resumenPeriquitosTxt').textContent = `${detalle} — ${awFormatMoney(periquitosBs, 'Bs')} / ${awFormatMoney(periquitosUsd, 'USD')}`;
    periquitosLinea.style.display = 'flex';
  } else {
    periquitosLinea.style.display = 'none';
  }

  document.getElementById('resumenTotalBs').textContent = awFormatMoney(totalBs, 'Bs');
  document.getElementById('resumenTotalUsd').textContent = awFormatMoney(totalUsd, 'USD');

  const hint = document.getElementById('servicioPrecioHint');
  const hayCobro = totalUsd > 0 || totalBs > 0;
  hint.textContent = hayCobro ? `Total a cobrar: ${awFormatMoney(totalUsd, 'USD')} · ${awFormatMoney(totalBs, 'Bs')}. (Tasa: ${awFormatMoney(tasa, 'Bs')}/$)` : '';
  actualizarResumenPagos();
}

/* ---------- Contador de bebidas/snacks ---------- */
function bindDrinkSteppers() {
  document.querySelectorAll('#drinkGrid .stepper button').forEach(btn => {
    btn.addEventListener('click', () => {
      const drink = btn.dataset.drink;
      const op = btn.dataset.op;
      let val = awDrinkCounts[drink] || 0;
      val = op === '+' ? val + 1 : Math.max(0, val - 1);
      awDrinkCounts[drink] = val;
      document.getElementById(`qty-${drink}`).textContent = val;
      actualizarHintPrecio();
    });
  });
}

/* ---------- Métodos de pago múltiples ---------- */
let awPagoFilaCounter = 0;

function paymentRowHtml(id) {
  return `
    <div class="pago-fila" data-pago-id="${id}">
      <div class="field">
        <label>Método</label>
        <select class="pago-metodo">
          <option value="efectivo">Efectivo</option>
          <option value="punto">Punto de venta</option>
          <option value="movil">Pago móvil</option>
          <option value="pendiente">Pendiente</option>
        </select>
      </div>
      <div class="field">
        <label>Moneda</label>
        <select class="pago-moneda">
          <option value="Bs">Bs</option>
          <option value="USD">$</option>
        </select>
      </div>
      <div class="field">
        <label>Monto</label>
        <input type="number" class="pago-monto" min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="field pago-referencia-wrap">
        <label>Referencia</label>
        <input type="text" class="pago-referencia" placeholder="N.º de referencia">
      </div>
      <button type="button" class="btn btn-ghost btn-quitar-fila pago-quitar" title="Quitar">×</button>
    </div>`;
}

function addPagoFila() {
  const cont = document.getElementById('pagosFilas');
  if (!cont) return;
  const id = `pg-${++awPagoFilaCounter}`;
  const div = document.createElement('div');
  div.innerHTML = paymentRowHtml(id);
  const row = div.firstElementChild;
  cont.appendChild(row);
  const metodo = row.querySelector('.pago-metodo');
  const moneda = row.querySelector('.pago-moneda');
  const monto = row.querySelector('.pago-monto');
  const ref = row.querySelector('.pago-referencia');
  const quitar = row.querySelector('.pago-quitar');

  const refresh = () => {
    const requiereRef = metodo.value === 'punto' || metodo.value === 'movil';
    const wrap = row.querySelector('.pago-referencia-wrap');
    wrap.style.opacity = requiereRef ? '1' : '.5';
    if (requiereRef) ref.setAttribute('required', 'required');
    else ref.removeAttribute('required');
    if (metodo.value === 'pendiente') {
      monto.value = '';
      monto.disabled = true;
      moneda.disabled = true;
      ref.value = '';
      ref.disabled = true;
    } else {
      monto.disabled = false;
      moneda.disabled = false;
      ref.disabled = false;
    }
    actualizarResumenPagos();
  };
  metodo.addEventListener('change', refresh);
  moneda.addEventListener('change', actualizarResumenPagos);
  monto.addEventListener('input', actualizarResumenPagos);
  ref.addEventListener('input', actualizarResumenPagos);
  quitar.addEventListener('click', () => {
    if (document.querySelectorAll('#pagosFilas .pago-fila').length <= 1) {
      showToast('Debe existir al menos un método de pago');
      return;
    }
    row.remove();
    actualizarResumenPagos();
  });
  refresh();
}

function leerPagos() {
  const pagos = [];
  document.querySelectorAll('#pagosFilas .pago-fila').forEach(row => {
    const metodo = row.querySelector('.pago-metodo').value;
    const moneda = row.querySelector('.pago-moneda').value;
    const monto = parseFloat(row.querySelector('.pago-monto').value) || 0;
    const referencia = row.querySelector('.pago-referencia').value.trim();
    pagos.push({ metodo, moneda, monto, referencia, ...awConvertir(monto, moneda, awTasaCache) });
  });
  return pagos;
}

function actualizarResumenPagos() {
  const pagos = leerPagos();
  const bs = pagos.reduce((a,p) => a + (p.montoBs || 0), 0);
  const usd = pagos.reduce((a,p) => a + (p.montoUsd || 0), 0);
  const el = document.getElementById('resumenPagosRegistro');
  if (el) el.innerHTML = `Total pagado: <strong>${awFormatMoney(bs, 'Bs')}</strong> · <strong>${awFormatMoney(usd, 'USD')}</strong>`;
}

function bindMetodoPago() {
  const btn = document.getElementById('btnAddPagoFila');
  if (btn) btn.addEventListener('click', addPagoFila);
  const cont = document.getElementById('pagosFilas');
  if (cont && !cont.children.length) addPagoFila();
  actualizarResumenPagos();
}

/* ---------- Envío del formulario ---------- */
async function onSubmitRegistro(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';

  const pagos = leerPagos();
  if (!pagos.length) {
    showToast('Agrega al menos un método de pago');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar lavado';
    return;
  }
  if (pagos.some(p => p.metodo === 'pendiente') && pagos.length > 1) {
    showToast('Pendiente no puede combinarse con otros métodos');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Registrar lavado';
    return;
  }
  for (const p of pagos) {
    if (p.metodo !== 'pendiente' && p.monto <= 0) {
      showToast('Cada método de pago debe tener un monto mayor que 0');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar lavado';
      return;
    }
    if ((p.metodo === 'punto' || p.metodo === 'movil') && !p.referencia) {
      showToast(`${awPaymentLabel(p.metodo)} requiere referencia`);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Registrar lavado';
      return;
    }
  }
  const serviciosFilas = leerFilasServicios();
  const lavadorId = document.getElementById('lavadorSelect').value || '';
  const lavador = lavadorId ? awLavadoresCache.find(l => l.id === lavadorId) : null;
  const fechaPasadaInput = document.getElementById('fechaRegistroPasada');
  let fechaFinal = new Date().toISOString();
  if (fechaPasadaInput && fechaPasadaInput.value) {
    const ahora = new Date();
    const [anio, mes, dia] = fechaPasadaInput.value.split('-').map(Number);
    fechaFinal = new Date(anio, mes - 1, dia, ahora.getHours(), ahora.getMinutes(), ahora.getSeconds()).toISOString();
  }

  const bebidasArr = awBebidasSnacksCache
    .filter(item => (awDrinkCounts[item.id] || 0) > 0)
    .map(item => ({
      id: item.id,
      nombre: item.nombre,
      emoji: item.emoji,
      cantidad: awDrinkCounts[item.id],
      precioBs: awPrecioBsEfectivo(item, awTasaCache),
      precioUsd: item.precioUsd
    }));
  const periquitosArr = leerFilasPeriquitos();

  const costoTotal = awCostoTotalRegistro({ servicios: serviciosFilas, bebidas: bebidasArr, periquitos: periquitosArr });
  const coberturaPago = awPagosCubrenTotal(pagos, costoTotal, awTasaCache);
  const pagosBs = coberturaPago.pagadoBs;
  const pagosUsd = coberturaPago.pagadoUsd;
  const estadoFinal = pagos.length === 1 && pagos[0].metodo === 'pendiente'
    ? 'PENDIENTE'
    : (coberturaPago.pagado ? 'PAGADO' : 'PENDIENTE');

  const registro = {
    id: awUid(),
    fecha: fechaFinal,
    cliente: {
      nombre: document.getElementById('clienteNombre').value.trim(),
      telefono: document.getElementById('clienteTelefono').value.trim()
    },
    carro: {
      modelo: document.getElementById('carroModelo').value.trim(),
      color: document.getElementById('carroColor').value.trim()
    },
    servicios: serviciosFilas,
    bebidas: bebidasArr,
    periquitos: periquitosArr,
    pago: {
      metodo: pagos[0].metodo,
      moneda: pagos[0].moneda,
      monto: pagos[0].monto,
      montoBs: pagosBs,
      montoUsd: pagosUsd,
      referencia: pagos.map(p => p.referencia).filter(Boolean).join(' | '),
      metodos: pagos.map(p => ({ metodo: p.metodo, moneda: p.moneda, monto: p.monto, montoBs: p.montoBs, montoUsd: p.montoUsd, referencia: p.referencia })),
      tasaUsada: awTasaCache
    },
    lavador: { id: lavadorId, nombre: lavador ? lavador.nombre : '—' },
    porcentajeLavador: parseFloat(document.getElementById('porcentajeLavador').value) || 0,
    propina: {
      monto: parseFloat(document.getElementById('propinaMonto').value) || 0,
      moneda: document.getElementById('propinaMoneda').value,
      referencia: document.getElementById('propinaReferencia').value.trim()
    },
    estado: estadoFinal,
    sucursalId: awSucursalActivaId,
    cuponAplicado: serviciosFilas.some(f => f.cuponAplicado),
    observaciones: document.getElementById('observacionesTexto').value.trim()
  };

  const ok = await awAddRegistro(registro);
  submitBtn.disabled = false;
  submitBtn.textContent = 'Registrar lavado';

  if (!ok) {
    showToast('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }
  for (const f of registro.periquitos) {
    await awVenderArticuloInventario(f.id, f.cantidad);
  }
  let mensajeFinal = 'Lavado registrado correctamente';
  if (registro.estado === 'PENDIENTE') {
    mensajeFinal = pagos[0].metodo === 'pendiente' ? 'Registrado como PENDIENTE' : '⚠️ Registrado como PENDIENTE (los pagos no cubren el total)';
  }
  showToast(mensajeFinal);
  resetForm();
  await renderTickets();
}

function resetForm() {
  document.getElementById('form-registro').reset();
  awBebidasSnacksCache.forEach(item => { awDrinkCounts[item.id] = 0; });
  document.querySelectorAll('#drinkGrid .stepper span').forEach(span => { span.textContent = '0'; });
  document.getElementById('periquitosFilas').innerHTML = '';
  document.getElementById('serviciosFilas').innerHTML = '';
  addServicioFila();
  document.getElementById('pagosFilas').innerHTML = '';
  addPagoFila();
  actualizarResumenPagos();
  actualizarHintPrecio();
  awGetInventario(awSucursalActivaId).then(inv => { awInventarioCache = inv; });
}

/* ---------- Render de tickets del día ---------- */
async function renderTickets() {
  const list = document.getElementById('ticketList');
  list.innerHTML = `<div class="empty-state">Cargando tickets…</div>`;

  const registros = await awGetRegistros(awSucursalActivaId);
  awTicketsHoyCache = registros.filter(r => awIsToday(r.fecha));
  renderTicketsFiltrados();
}

function renderTicketsFiltrados() {
  const list = document.getElementById('ticketList');
  const query = document.getElementById('buscadorTickets').value.trim().toLowerCase();

  const filtrados = query
    ? awTicketsHoyCache.filter(r =>
        r.cliente.nombre.toLowerCase().includes(query) ||
        r.carro.modelo.toLowerCase().includes(query)
      )
    : awTicketsHoyCache;

  document.getElementById('ticketsCount').textContent = `${filtrados.length} de ${awTicketsHoyCache.length} registro${awTicketsHoyCache.length === 1 ? '' : 's'} hoy`;

  if (awTicketsHoyCache.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🧽</div>Todavía no hay registros hoy.<br>El primer ticket del día aparecerá aquí.</div>`;
    return;
  }
  if (filtrados.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🔎</div>No hay tickets que coincidan con "${escapeHtml(query)}".</div>`;
    return;
  }

  list.innerHTML = filtrados.map(r => renderTicket(r)).join('');

  list.querySelectorAll('[data-toggle-pay]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(`pay-form-${btn.dataset.togglePay}`);
      form.classList.toggle('open');
    });
  });
  list.querySelectorAll('[data-confirm-pay]').forEach(btn => {
    btn.addEventListener('click', () => confirmarPago(btn.dataset.confirmPay));
  });
  list.querySelectorAll('[data-print-ticket]').forEach(btn => {
    btn.addEventListener('click', () => imprimirTicket(btn.dataset.printTicket));
  });
}

function renderTicket(r) {
  const bebidasTxt = awBebidasATexto(r.bebidas);

  const propinaTxt = r.propina.monto > 0
    ? awFormatMoney(r.propina.monto, r.propina.moneda) + (r.propina.referencia ? ` (Ref: ${escapeHtml(r.propina.referencia)})` : '')
    : '—';

  const periquitosTxt = escapeHtml(awPeriquitosATexto(r.periquitos));

  const pendienteBlock = r.estado === 'PENDIENTE' ? `
    <div class="ticket-actions">
      <button class="btn btn-accent btn-sm" data-toggle-pay="${r.id}">Marcar como pagado</button>
    </div>
    <div class="inline-pay-form" id="pay-form-${r.id}">
      <div class="field-row thirds">
        <div class="field">
          <label>Método</label>
          <select id="pay-metodo-${r.id}">
            <option value="efectivo">Efectivo</option>
            <option value="punto">Punto de venta</option>
            <option value="movil">Pago móvil</option>
          </select>
        </div>
        <div class="field">
          <label>Moneda</label>
          <select id="pay-moneda-${r.id}">
            <option value="Bs">Bs</option>
            <option value="USD">$</option>
          </select>
        </div>
        <div class="field">
          <label>Monto a agregar</label>
          <input type="number" id="pay-monto-${r.id}" value="" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>
      <div class="field">
        <label>Referencia</label>
        <input type="text" id="pay-ref-${r.id}" placeholder="N.º de referencia">
      </div>
      <button class="btn btn-primary btn-sm" data-confirm-pay="${r.id}">Confirmar pago</button>
    </div>
  ` : '';

  return `
    <article class="ticket">
      <div class="ticket-top">
        <div>
          <div class="ticket-client">${escapeHtml(r.cliente.nombre)}</div>
          <div class="ticket-sub">${escapeHtml(r.cliente.telefono)} · ${escapeHtml(r.carro?.modelo || '—')}${r.carro?.color ? ` (${escapeHtml(r.carro.color)})` : ''}</div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
          <span class="stamp ${r.estado.toLowerCase()}">${r.estado}</span>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-ghost btn-sm" data-print-ticket="${r.id}" title="Imprimir">🖨️</button>
            <a class="btn btn-whatsapp btn-sm" href="${awWhatsAppLink(r.cliente.telefono, r.cliente.nombre, r.carro.modelo)}" target="_blank" rel="noopener">💬 WhatsApp</a>
          </div>
        </div>
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-grid">
        <div class="lbl">Servicio</div><div class="val">${escapeHtml(awServiciosATexto(r.servicios))}</div>
        <div class="lbl">Bebidas/Snacks</div><div class="val">${bebidasTxt}</div>
        <div class="lbl">Periquitos</div><div class="val">${periquitosTxt}</div>
        <div class="lbl">Métodos de pago</div><div class="val">${escapeHtml(awPaymentSummary(r.pago))}</div>
        <div class="lbl">Lavador</div><div class="val">${escapeHtml(r.lavador?.nombre || '—')} (${r.porcentajeLavador}%)</div>
        <div class="lbl">Propina</div><div class="val">${propinaTxt}</div>
        ${r.observaciones ? `<div class="lbl">Obs.</div><div class="val">${escapeHtml(r.observaciones)}</div>` : ''}
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-grid">
        <div class="lbl">Total</div><div class="val ticket-amount">${awFormatMoney(awCostoTotalRegistro(r).usd, 'USD')} · ${awFormatMoney(awCostoTotalRegistro(r).bs, 'Bs')}</div>
        <div class="lbl">Hora</div><div class="val">${awFormatDateTime(r.fecha)}</div>
      </div>
      ${pendienteBlock}
    </article>
  `;
}

async function confirmarPago(id) {
  const registroActual = awTicketsHoyCache.find(t => t.id === id);
  if (!registroActual) return;
  const row = document.getElementById(`pay-form-${id}`);
  const metodo = document.getElementById(`pay-metodo-${id}`).value;
  const moneda = document.getElementById(`pay-moneda-${id}`).value;
  const monto = parseFloat(document.getElementById(`pay-monto-${id}`).value) || 0;
  const referencia = document.getElementById(`pay-ref-${id}`).value.trim();
  if (monto <= 0) { showToast('El monto debe ser mayor que 0'); return; }
  if ((metodo === 'punto' || metodo === 'movil') && !referencia) { showToast(`${awPaymentLabel(metodo)} requiere referencia`); return; }
  const nuevoPago = { metodo, moneda, monto, referencia, ...awConvertir(monto, moneda, awTasaCache) };
  const pagosPrevios = Array.isArray(registroActual.pago?.metodos) && registroActual.pago.metodos.length
    ? registroActual.pago.metodos.filter(p => p.metodo !== 'pendiente')
    : (registroActual.pago?.metodo && registroActual.pago.metodo !== 'pendiente' ? [{ metodo: registroActual.pago.metodo, moneda: registroActual.pago.moneda, monto: registroActual.pago.monto, montoBs: registroActual.pago.montoBs, montoUsd: registroActual.pago.montoUsd, referencia: registroActual.pago.referencia }] : []);
  const pagos = [...pagosPrevios, nuevoPago];
  const costoTotal = awCostoTotalRegistro(registroActual);
  const coberturaPago = awPagosCubrenTotal(pagos, costoTotal, awTasaCache);
  const totalUsd = coberturaPago.pagadoUsd;
  const totalBs = coberturaPago.pagadoBs;
  const nuevoEstado = coberturaPago.pagado ? 'PAGADO' : 'PENDIENTE';
  const pago = { metodo: pagos[0]?.metodo || metodo, moneda: pagos[0]?.moneda || moneda, monto: pagos[0]?.monto || monto, montoBs: totalBs, montoUsd: totalUsd, referencia: pagos.map(p=>p.referencia).filter(Boolean).join(' | '), metodos: pagos, tasaUsada: awTasaCache };
  const ok = await awUpdateRegistro(id, { estado: nuevoEstado, pago });
  showToast(ok ? (nuevoEstado === 'PAGADO' ? 'Pago confirmado' : 'Abono registrado — todavía queda pendiente') : 'No se pudo actualizar. Intenta de nuevo.');
  await renderTickets();
}

/* ---------- Imprimir ticket ---------- */
function imprimirTicket(id) {
  const r = awTicketsHoyCache.find(t => t.id === id);
  if (!r) return;
  const bebidasTxt = awBebidasATexto(r.bebidas);
  const propinaTxt = r.propina.monto > 0 ? awFormatMoney(r.propina.monto, r.propina.moneda) : '—';
  const periquitosTxt = awPeriquitosATexto(r.periquitos);

  const html = `
    <html><head><meta charset="UTF-8"><title>Ticket - ${escapeHtml(r.cliente.nombre)}</title>
    <style>
      body{ font-family: 'Courier New', monospace; padding:20px; max-width:340px; margin:0 auto; color:#000; }
      h1{ font-size:1.1rem; text-align:center; margin-bottom:2px; }
      .sub{ text-align:center; font-size:.75rem; margin-bottom:14px; }
      table{ width:100%; border-collapse:collapse; font-size:.85rem; }
      td{ padding:4px 0; vertical-align:top; }
      td.lbl{ color:#444; }
      td.val{ text-align:right; font-weight:bold; }
      hr{ border:none; border-top:1px dashed #000; margin:10px 0; }
      .total{ font-size:1.1rem; }
      .footer{ text-align:center; font-size:.7rem; margin-top:16px; color:#555; }
    </style>
    </head><body>
      <h1>VENTA FALCON AUTO MOTOR</h1>
      <div class="sub">${awFormatDateTime(r.fecha)}</div>
      <hr>
      <table>
        <tr><td class="lbl">Cliente</td><td class="val">${escapeHtml(r.cliente.nombre)}</td></tr>
        <tr><td class="lbl">Teléfono</td><td class="val">${escapeHtml(r.cliente.telefono)}</td></tr>
        <tr><td class="lbl">Vehículo</td><td class="val">${escapeHtml(r.carro?.modelo || '—')}${r.carro?.color ? ` (${escapeHtml(r.carro.color)})` : ''}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="lbl">Servicio</td><td class="val">${escapeHtml(awServiciosATexto(r.servicios))}</td></tr>
        <tr><td class="lbl">Bebidas/Snacks</td><td class="val">${escapeHtml(bebidasTxt)}</td></tr>
        <tr><td class="lbl">Periquitos</td><td class="val">${escapeHtml(periquitosTxt)}</td></tr>
        <tr><td class="lbl">Lavador</td><td class="val">${escapeHtml(r.lavador?.nombre || '—')}</td></tr>
        <tr><td class="lbl">Propina</td><td class="val">${propinaTxt}</td></tr>
        <tr><td class="lbl">Pagos</td><td class="val">${escapeHtml(awPaymentSummary(r.pago))}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="lbl total">TOTAL</td><td class="val total">${awFormatMoney(awCostoTotalRegistro(r).usd, 'USD')} / ${awFormatMoney(awCostoTotalRegistro(r).bs, 'Bs')}</td></tr>
        <tr><td class="lbl">Estado</td><td class="val">${r.estado}</td></tr>
      </table>
      <div class="footer">¡Gracias por su preferencia!</div>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>
  `;
  const win = window.open('', '_blank', 'width=380,height=600');
  win.document.write(html);
  win.document.close();
}

/* ---------- Helpers ---------- */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
