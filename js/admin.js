/* =========================================================
   admin.js — lógica del panel administrativo
   ========================================================= */

let awPendingDeleteAction = null;
let awServiciosCache = [];
let awLavadoresCache = [];
let awBebidasSnacksCache = [];
let awRegistrosCache = [];
let awGastosCache = [];
let awInventarioCache = [];
let awTasaCache = 1;
let awNewIdCounter = 0;
let awPerfilActual = null; // { id, email, rol, estado }
let awSucursalesCache = [];
let awSucursalActivaAdmin = 'todas';

function awTempId() { return `new-${++awNewIdCounter}`; }

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

/* ---------- Registro (autoregistro, queda pendiente de aprobación) ---------- */
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

/* ---------- Resolver sesión: decide si mostrar panel, pantalla de pendiente, o login ---------- */
async function resolverSesion(session) {
  const perfil = await awGetMiPerfil();
  awPerfilActual = perfil;
  if (!perfil || perfil.estado !== 'activo') {
    mostrarPantallaPendiente(perfil);
    return;
  }
  mostrarPanelAdmin(session, perfil);
}

function mostrarPantallaLogin() {
  awPerfilActual = null;
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('pendingScreen').style.display = 'none';
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutEmail').style.display = 'none';
  document.getElementById('tasaWidget').style.display = 'none';
  mostrarModoLogin('login');
}

function mostrarPantallaPendiente(perfil) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('pendingScreen').style.display = 'flex';
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutEmail').style.display = 'none';
  document.getElementById('tasaWidget').style.display = 'none';
  const msgEl = document.querySelector('#pendingScreen p.hint');
  if (perfil && perfil.estado === 'rechazado') {
    msgEl.textContent = 'Tu acceso fue rechazado por el administrador. Contáctalo si crees que es un error.';
  } else {
    msgEl.textContent = 'Tu acceso todavía no ha sido aprobado. Contacta al dueño del negocio para que lo apruebe.';
  }
}

function mostrarPanelAdmin(session, perfil) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('pendingScreen').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  document.getElementById('logoutEmail').style.display = 'inline';
  document.getElementById('logoutEmail').textContent = `${session.user.email} (${AW_ROL_LABELS[perfil.rol] || perfil.rol})`;
  aplicarRestriccionesPorRol(perfil.rol);
  initAdminPanel();
}

/* ---------- Restricciones de UI según el rol (la seguridad real está en RLS) ---------- */
function aplicarRestriccionesPorRol(rol) {
  document.getElementById('tabBtnUsuarios').style.display = rol === 'dueno' ? 'block' : 'none';

  // Cajero: solo ve Resumen. El resto de pestañas se ocultan.
  const tabsRestringidas = ['gastos', 'inventario', 'servicios', 'bebidas', 'lavadores'];
  tabsRestringidas.forEach(tab => {
    const btn = document.querySelector(`.admin-tab-btn[data-tab="${tab}"]`);
    if (btn) btn.style.display = (rol === 'cajero') ? 'none' : 'block';
  });
  if (rol === 'cajero') {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.admin-tab-btn[data-tab="resumen"]').classList.add('active');
    document.getElementById('panel-resumen').classList.add('active');
  }

  // Tasa: Dueño y Cajero la pueden editar; Gerente solo la ve.
  const tasaWidget = document.getElementById('tasaWidget');
  tasaWidget.style.display = 'flex';
  const inputTasa = document.getElementById('tasaInput');
  const btnTasa = document.getElementById('btnGuardarTasa');
  const puedeEditarTasa = (rol === 'dueno' || rol === 'gerente' || rol === 'cajero');
  inputTasa.disabled = !puedeEditarTasa;
  btnTasa.style.display = puedeEditarTasa ? 'inline-flex' : 'none';

  // Fecha pasada en Registro: interruptor exclusivo del Dueño.
  document.getElementById('fechaPasadaWidget').style.display = rol === 'dueno' ? 'flex' : 'none';
}

let awAdminInicializado = false;
async function initAdminPanel() {
  if (awAdminInicializado) { renderAll(); return; }
  awAdminInicializado = true;
  bindTabs();
  bindFiltros();
  bindModal();
  document.getElementById('btnAddServicio').addEventListener('click', addServicioLocal);
  document.getElementById('btnAddInventario').addEventListener('click', addInventarioLocal);
  document.getElementById('btnGuardarInventario').addEventListener('click', guardarInventario);
  document.getElementById('btnDescargarPlantilla').addEventListener('click', descargarPlantillaInventario);
  document.getElementById('btnCargaMasiva').addEventListener('click', () => document.getElementById('inputCargaMasiva').click());
  document.getElementById('inputCargaMasiva').addEventListener('change', onCargaMasivaInventario);
  document.getElementById('btnGuardarServicios').addEventListener('click', guardarServicios);
  document.getElementById('btnAddBebida').addEventListener('click', addBebidaLocal);
  document.getElementById('btnGuardarBebidas').addEventListener('click', guardarBebidas);
  document.getElementById('btnAddLavador').addEventListener('click', addLavadorLocal);
  document.getElementById('btnGuardarLavadores').addEventListener('click', guardarLavadores);
  document.getElementById('form-gasto').addEventListener('submit', onSubmitGasto);
  document.getElementById('btnExportarCsv').addEventListener('click', exportarRegistrosCsv);
  document.getElementById('btnGuardarTasa').addEventListener('click', guardarTasa);
  document.getElementById('fechaPasadaToggle').addEventListener('change', onToggleFechaPasada);
  cargarFechaPasadaToggle();
  document.getElementById('gastoFecha').value = new Date().toISOString().slice(0, 10);
  await configurarSucursalAdmin();
  renderAll();
}

/* ---------- Selector de sucursal (Dueño/Gerente: I / II / Todas — Cajero: fija) ---------- */
async function configurarSucursalAdmin() {
  awSucursalesCache = await awGetSucursales();
  const widget = document.getElementById('sucursalWidgetAdmin');
  const sel = document.getElementById('sucursalSelectAdmin');
  widget.style.display = 'flex';

  if (awPerfilActual.rol === 'cajero') {
    const suc = awSucursalesCache.find(s => s.id === awPerfilActual.sucursal_id);
    sel.innerHTML = `<option value="${awPerfilActual.sucursal_id || ''}">${suc ? escapeHtml(suc.nombre) : 'Sin asignar'}</option>`;
    sel.disabled = true;
    awSucursalActivaAdmin = awPerfilActual.sucursal_id || 'todas';
    awActualizarLogoSucursal(awSucursalActivaAdmin, awSucursalesCache);
    return;
  }

  sel.disabled = false;
  sel.innerHTML = awSucursalesCache.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')
    + '<option value="todas">Todas</option>';
  const guardada = localStorage.getItem('aw_sucursal_activa_admin');
  const valida = guardada && (guardada === 'todas' || awSucursalesCache.some(s => s.id === guardada));
  awSucursalActivaAdmin = valida ? guardada : 'todas';
  sel.value = awSucursalActivaAdmin;
  awActualizarLogoSucursal(awSucursalActivaAdmin, awSucursalesCache);

  sel.addEventListener('change', () => {
    awSucursalActivaAdmin = sel.value;
    localStorage.setItem('aw_sucursal_activa_admin', awSucursalActivaAdmin);
    awActualizarLogoSucursal(awSucursalActivaAdmin, awSucursalesCache);
    renderAll();
  });
}

/* Filtra una lista cacheada (servicios/bebidas/inventario/lavadores/gastos) por la sucursal activa */
function awFiltrarPorSucursalActiva(lista) {
  if (awSucursalActivaAdmin === 'todas') return lista;
  return lista.filter(item => item.sucursalId === awSucursalActivaAdmin);
}

function awNombreSucursal(id) {
  const s = awSucursalesCache.find(x => x.id === id);
  return s ? s.nombre : '—';
}

async function cargarFechaPasadaToggle() {
  const valor = await awGetPermitirFechaPasada();
  document.getElementById('fechaPasadaToggle').checked = valor;
}

async function onToggleFechaPasada(e) {
  const ok = await awSetPermitirFechaPasada(e.target.checked);
  if (!ok) {
    e.target.checked = !e.target.checked;
    showToast('No se pudo actualizar');
    return;
  }
  showToast(e.target.checked ? 'Fecha pasada activada en Registro' : 'Fecha pasada desactivada');
}

/* ---------- Tasa de cambio ---------- */
async function guardarTasa() {
  const nueva = parseFloat(document.getElementById('tasaInput').value) || 0;
  if (nueva <= 0) { showToast('Ingresa una tasa válida'); return; }
  const btn = document.getElementById('btnGuardarTasa');
  btn.disabled = true;
  const ok = await awSetTasa(nueva);
  btn.disabled = false;
  if (!ok) { showToast('No se pudo guardar la tasa'); return; }
  awTasaCache = nueva;
  showToast('Tasa actualizada');
  renderServicios();
  renderBebidas();
}

/* ---------- Tabs ---------- */
function bindTabs() {
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

/* ---------- Filtros ---------- */
function poblarFiltroSelects() {
  const selL = document.getElementById('filtroLavador');
  const selS = document.getElementById('filtroServicio');
  selL.innerHTML = '<option value="">Todos</option>' + awLavadoresCache.map(l => `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`).join('');
  selS.innerHTML = '<option value="">Todos</option>' + awServiciosCache.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
}

function bindFiltros() {
  ['filtroDesde', 'filtroHasta', 'filtroEstado', 'filtroLavador', 'filtroServicio'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderFromCache);
  });
  document.getElementById('buscadorRegistrosAdmin').addEventListener('input', renderFromCache);
  document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
    ['filtroDesde', 'filtroHasta', 'filtroEstado', 'filtroLavador', 'filtroServicio'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('buscadorRegistrosAdmin').value = '';
    renderFromCache();
  });
}

function getFiltered() {
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const estado = document.getElementById('filtroEstado').value;
  const lavadorId = document.getElementById('filtroLavador').value;
  const servicioId = document.getElementById('filtroServicio').value;

  return awRegistrosCache.filter(r => {
    const fecha = new Date(r.fecha);
    if (desde && fecha < new Date(desde + 'T00:00:00')) return false;
    if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    if (estado && r.estado !== estado) return false;
    if (lavadorId && (!r.lavador || r.lavador.id !== lavadorId)) return false;
    if (servicioId && !(r.servicios || []).some(s => s.id === servicioId)) return false;
    if (awSucursalActivaAdmin !== 'todas' && r.sucursalId !== awSucursalActivaAdmin) return false;
    return true;
  });
}

/* Devuelve {bs, usd} a cobrar de un registro, siempre completos (incluye Periquitos
   sin importar en qué moneda se haya cargado), usando lo guardado en pago.montoBs/montoUsd
   con respaldo (tickets viejos) al cálculo simple por pago.monto/pago.moneda. */
function awMontosRegistro(r) {
  const pago = r.pago || {};
  const pagos = Array.isArray(pago.metodos) && pago.metodos.length
    ? pago.metodos
    : [pago];
  return pagos.reduce((tot, p) => {
    if (typeof p.montoBs === 'number' && typeof p.montoUsd === 'number') {
      tot.bs += p.montoBs; tot.usd += p.montoUsd;
    } else {
      const conv = awConvertir(p.monto, p.moneda, p.tasaUsada || pago.tasaUsada || awTasaCache || 1);
      tot.bs += conv.bs; tot.usd += conv.usd;
    }
    return tot;
  }, { bs: 0, usd: 0 });
}

/* renderAll: recarga todo desde la base de datos */
async function renderAll() {
  const [servicios, lavadores, bebidas, registros, gastos, tasa, inventario] = await Promise.all([
    awGetServicios(),
    awGetLavadores(),
    awGetBebidasSnacks(),
    awGetRegistros(),
    awGetGastos(),
    awGetTasa(),
    awGetInventario()
  ]);
  awServiciosCache = servicios;
  awLavadoresCache = lavadores;
  awBebidasSnacksCache = bebidas;
  awRegistrosCache = registros;
  awGastosCache = gastos;
  awTasaCache = tasa;
  awInventarioCache = inventario;
  document.getElementById('tasaInput').value = tasa;

  poblarFiltroSelects();
  renderFromCache();
  renderServicios();
  renderBebidas();
  renderLavadores();
  renderGastos();
  renderInventario();
  if (awPerfilActual && awPerfilActual.rol === 'dueno') await renderUsuarios();
}

/* renderFromCache: solo re-pinta con lo que ya está en memoria (filtros, sin red) */
function renderFromCache() {
  const filtrados = getFiltered();
  renderResumen(filtrados);
  renderTablaRegistros(aplicarBusquedaRegistros(filtrados));
}

function aplicarBusquedaRegistros(registros) {
  const q = document.getElementById('buscadorRegistrosAdmin').value.trim().toLowerCase();
  if (!q) return registros;
  return registros.filter(r => {
    const campos = [
      r.cliente.nombre, r.cliente.telefono, r.carro?.modelo || '', r.carro?.color || '',
      awServiciosATexto(r.servicios), r.lavador.nombre, r.pago.referencia, r.pago.metodo, awPaymentSummary(r.pago),
      r.estado, r.observaciones, awBebidasATexto(r.bebidas), awPeriquitosATexto(r.periquitos)
    ];
    return campos.some(c => c && String(c).toLowerCase().includes(q));
  });
}

/* ---------- Resumen (KPIs) ---------- */
function renderResumen(registros) {
  const pagados = registros.filter(r => r.estado === 'PAGADO');
  const pendientes = registros.filter(r => r.estado === 'PENDIENTE');

  const totalBs = sumBy(pagados, r => awMontosRegistro(r).bs);
  const totalUsd = sumBy(pagados, r => awMontosRegistro(r).usd);
  const pendienteBs = sumBy(pendientes, r => awMontosRegistro(r).bs);
  const pendienteUsd = sumBy(pendientes, r => awMontosRegistro(r).usd);
  const propinaBs = sumBy(registros.filter(r => r.propina.moneda === 'Bs'), r => r.propina.monto);
  const propinaUsd = sumBy(registros.filter(r => r.propina.moneda === 'USD'), r => r.propina.monto);
  const gastosBs = sumBy(awGastosCache.filter(g => g.moneda === 'Bs'), g => g.monto);
  const gastosUsd = sumBy(awGastosCache.filter(g => g.moneda === 'USD'), g => g.monto);
  const netoBs = totalBs - gastosBs;
  const netoUsd = totalUsd - gastosUsd;

  const kpis = [
    { label: 'Registros filtrados', value: registros.length, sub: `${pagados.length} pagados` },
    { label: 'Total cobrado (Bs)', value: awFormatMoney(totalBs, 'Bs'), sub: 'Solo lavados pagados' },
    { label: 'Total cobrado ($)', value: awFormatMoney(totalUsd, 'USD'), sub: 'Solo lavados pagados' },
    { label: 'Pendientes por cobrar', value: pendientes.length, sub: pendientes.length ? 'Requieren seguimiento' : 'Al día 🎉' },
    { label: 'Monto pendiente (Bs)', value: awFormatMoney(pendienteBs, 'Bs'), sub: 'Incluye Periquitos' },
    { label: 'Monto pendiente ($)', value: awFormatMoney(pendienteUsd, 'USD'), sub: 'Incluye Periquitos' },
    { label: 'Propinas (Bs)', value: awFormatMoney(propinaBs, 'Bs'), sub: '' },
    { label: 'Propinas ($)', value: awFormatMoney(propinaUsd, 'USD'), sub: '' },
    { label: 'Gastos (Bs)', value: awFormatMoney(gastosBs, 'Bs'), sub: 'Todo el historial' },
    { label: 'Gastos ($)', value: awFormatMoney(gastosUsd, 'USD'), sub: 'Todo el historial' },
    { label: 'Ingresos - Gastos (Bs)', value: awFormatMoney(netoBs, 'Bs'), sub: 'Cifra aproximada' },
    { label: 'Ingresos - Gastos ($)', value: awFormatMoney(netoUsd, 'USD'), sub: 'Cifra aproximada' }
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${escapeHtml(k.sub || '')}</div>
    </div>
  `).join('');

  const tablaPendientes = document.getElementById('tablaPendientes');
  if (tablaPendientes) {
    tablaPendientes.innerHTML = pendientes.length ? pendientes.map(r => {
      const costoTotal = awCostoTotalRegistro(r);
      const pagado = awMontosRegistro(r);
      const saldoBs = Math.max(0, costoTotal.bs - pagado.bs);
      const saldoUsd = Math.max(0, costoTotal.usd - pagado.usd);
      return `
      <tr>
        <td>${escapeHtml(r.cliente.nombre)}</td>
        <td>${escapeHtml(r.cliente.telefono)}</td>
        <td>${escapeHtml(r.carro?.modelo || '—')}${r.carro?.color ? ` (${escapeHtml(r.carro.color)})` : ''}</td>
        <td>${escapeHtml(awServiciosATexto(r.servicios))}</td>
        <td>${escapeHtml(awPaymentSummary(r.pago))}</td>
        <td>${awFormatDateTime(r.fecha)}</td>
        <td>
          <button class="btn btn-accent btn-sm" data-toggle-pago-admin="${r.id}">💳 Completar pago</button>
          <div class="inline-pay-form" id="pago-admin-form-${r.id}">
            <div class="field-row thirds">
              <div class="field">
                <label>Método</label>
                <select id="pago-admin-metodo-${r.id}">
                  <option value="efectivo">Efectivo</option>
                  <option value="punto">Punto de venta</option>
                  <option value="movil">Pago móvil</option>
                </select>
              </div>
              <div class="field">
                <label>Moneda</label>
                <select id="pago-admin-moneda-${r.id}">
                  <option value="Bs" ${r.pago.moneda === 'Bs' ? 'selected' : ''}>Bs</option>
                  <option value="USD" ${r.pago.moneda === 'USD' ? 'selected' : ''}>$</option>
                </select>
              </div>
              <div class="field">
                <label>Monto (saldo: ${awFormatMoney(saldoBs, 'Bs')} / ${awFormatMoney(saldoUsd, 'USD')})</label>
                <input type="number" id="pago-admin-monto-${r.id}" value="${r.pago.moneda === 'USD' ? saldoUsd.toFixed(2) : saldoBs.toFixed(2)}" step="0.01" min="0">
              </div>
            </div>
            <div class="field">
              <label>Referencia</label>
              <input type="text" id="pago-admin-ref-${r.id}" placeholder="N.º de referencia">
            </div>
            <button class="btn btn-primary btn-sm" data-confirm-pago-admin="${r.id}">Confirmar</button>
          </div>
        </td>
      </tr>
    `;
    }).join('') : `<tr><td colspan="7" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay clientes con pago pendiente 🎉</td></tr>`;

    tablaPendientes.querySelectorAll('[data-toggle-pago-admin]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById(`pago-admin-form-${btn.dataset.togglePagoAdmin}`).classList.toggle('open');
      });
    });
    tablaPendientes.querySelectorAll('[data-confirm-pago-admin]').forEach(btn => {
      btn.addEventListener('click', () => confirmarPagoDesdeAdmin(btn.dataset.confirmPagoAdmin));
    });
  }

  /* Comisiones + propina por lavador */
  const porLavador = {};
  pagados.forEach(r => {
    const key = r.lavador.id + '|' + r.lavador.nombre;
    if (!porLavador[key]) porLavador[key] = { nombre: r.lavador.nombre, cantidad: 0, totalBs: 0, totalUsd: 0, comisionBs: 0, comisionUsd: 0, propinaBs: 0, propinaUsd: 0 };
    porLavador[key].cantidad += 1;
    const montos = awMontosRegistro(r);
    porLavador[key].totalBs += montos.bs;
    porLavador[key].totalUsd += montos.usd;
    porLavador[key].comisionBs += montos.bs * (r.porcentajeLavador / 100);
    porLavador[key].comisionUsd += montos.usd * (r.porcentajeLavador / 100);
    if (r.propina.monto > 0) {
      if (r.propina.moneda === 'USD') porLavador[key].propinaUsd += r.propina.monto;
      else porLavador[key].propinaBs += r.propina.monto;
    }
  });

  const filas = Object.values(porLavador);
  document.getElementById('tablaComisiones').innerHTML = filas.length ? filas.map(f => `
    <tr>
      <td>${escapeHtml(f.nombre)}</td>
      <td>${f.cantidad}</td>
      <td>${awFormatMoney(f.totalBs, 'Bs')} · ${awFormatMoney(f.totalUsd, 'USD')}</td>
      <td>${awFormatMoney(f.comisionBs, 'Bs')} · ${awFormatMoney(f.comisionUsd, 'USD')}</td>
      <td>${awFormatMoney(f.propinaBs, 'Bs')} · ${awFormatMoney(f.propinaUsd, 'USD')}</td>
    </tr>
  `).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay lavados pagados en este período</td></tr>`;
}

function sumBy(arr, fn) { return arr.reduce((acc, x) => acc + (fn(x) || 0), 0); }

async function confirmarPagoDesdeAdmin(id) {
  const metodo = document.getElementById(`pago-admin-metodo-${id}`).value;
  const moneda = document.getElementById(`pago-admin-moneda-${id}`).value;
  const monto = parseFloat(document.getElementById(`pago-admin-monto-${id}`).value) || 0;
  const referencia = document.getElementById(`pago-admin-ref-${id}`).value.trim();
  if (monto <= 0) { showToast('El monto debe ser mayor que 0'); return; }
  if ((metodo === 'punto' || metodo === 'movil') && !referencia) { showToast(`${awPaymentLabel(metodo)} requiere referencia`); return; }
  const registroActual = awRegistrosCache.find(r => r.id === id);
  if (!registroActual) return;
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
  showToast(ok ? (nuevoEstado === 'PAGADO' ? 'Pago completado' : 'Abono registrado — todavía queda pendiente') : 'No se pudo actualizar');
  await renderAll();
}

/* ---------- Tabla de registros ---------- */
function renderTablaRegistros(registros) {
  document.getElementById('registrosCount').textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;
  const tbody = document.getElementById('tablaRegistros');

  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="17" style="text-align:center;color:var(--ink-soft);padding:24px;">No hay registros con estos filtros</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const bebidasTxt = awBebidasATexto(r.bebidas);
    const periquitosTxt = awPeriquitosATexto(r.periquitos);
    const montosPago = awMontosRegistro(r);
    const comisionBs = montosPago.bs * (r.porcentajeLavador / 100);
    const comisionUsd = montosPago.usd * (r.porcentajeLavador / 100);
    const propinaTxt = r.propina.monto > 0 ? awFormatMoney(r.propina.monto, r.propina.moneda) : '—';
    const accionWhatsApp = r.cliente?.telefono
      ? `<a class="btn btn-whatsapp btn-sm" href="${awWhatsAppLinkSeguimiento(r)}" target="_blank" rel="noopener">📲 WhatsApp</a>`
      : '';
    const accionPendiente = r.estado === 'PENDIENTE'
      ? `<a class="btn btn-whatsapp btn-sm" href="${awWhatsAppLinkPendiente(r)}" target="_blank" rel="noopener">💬 Recordar</a>`
      : '';
    return `
      <tr>
        <td>${awFormatDateTime(r.fecha)}</td>
        <td>${escapeHtml(r.cliente.nombre)}${r.cuponAplicado ? ' 🎟️' : ''}</td>
        <td>${escapeHtml(r.cliente.telefono)}</td>
        <td>${escapeHtml(r.carro?.modelo || '—')}${r.carro?.color ? ` (${escapeHtml(r.carro.color)})` : ''}</td>
        <td>${escapeHtml(awServiciosATexto(r.servicios))}</td>
        <td>${escapeHtml(bebidasTxt)}</td>
        <td>${escapeHtml(periquitosTxt)}</td>
        <td>${escapeHtml(awPaymentSummary(r.pago))}</td>
        <td>${r.pago.referencia ? escapeHtml(r.pago.referencia) : '—'}</td>
        <td>${awFormatMoney(awMontosRegistro(r).usd, 'USD')} · ${awFormatMoney(awMontosRegistro(r).bs, 'Bs')}</td>
        <td>${escapeHtml(r.lavador?.nombre || '—')}</td>
        <td>${r.porcentajeLavador}%</td>
        <td>${awFormatMoney(comisionBs, 'Bs')} · ${awFormatMoney(comisionUsd, 'USD')}</td>
        <td>${propinaTxt}</td>
        <td><span class="badge ${r.estado.toLowerCase()}">${r.estado}</span></td>
        <td>${r.observaciones ? escapeHtml(r.observaciones) : '—'}</td>
        <td>
          <div class="row-actions">
            ${accionWhatsApp}
            ${accionPendiente}
            ${awPerfilActual && awPerfilActual.rol !== 'cajero' ? `<button class="btn btn-danger btn-sm" data-del-registro="${r.id}">Eliminar</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-del-registro]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction(
        '¿Eliminar este registro? Esta acción no se puede deshacer.',
        async () => { await awDeleteRegistro(btn.dataset.delRegistro); showToast('Registro eliminado'); await renderAll(); }
      );
    });
  });
}

function awWhatsAppLinkSeguimiento(r) {
  const numero = awNormalizarTelefonoVE(r.cliente?.telefono);
  const servicios = (r.servicios || [])
    .map(s => s?.nombre || s?.tipo || '')
    .filter(Boolean);
  const servicioTexto = servicios.length ? servicios.join(' + ') : 'servicio realizado';
  const mensaje = `Estimado cliente ¡Bendiciones!.

Reciba un cordial saludo de parte de Multiservicio Venta Falcón.📲 

Le contactamos para agradecerle por habernos visitado el día de ayer. Para nosotros su opinión es 💯 fundamental por lo que nos encantaría saber qué le pareció el servicio recibido y si tiene alguna sugerencia que nos ayude a mejorar.
 Quedamos atentos a sus comentarios.🚀💯🚘😎`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

function awWhatsAppLinkPendiente(r) {
  const numero = awNormalizarTelefonoVE(r.cliente.telefono);
  const montoUsd = awMontosRegistro(r).usd;
  const mensaje = `Hola, buenas Sr(a) ${r.cliente.nombre}, le escribimos de Venta Falcon Auto Motor para recordarle que el servicio de su vehículo ${r.carro.modelo} quedó con un saldo pendiente de ${awFormatMoney(montoUsd, 'USD')}. Quedamos atentos para coordinar el pago, ¡gracias por su preferencia!`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/* ---------- Exportar CSV ---------- */
function exportarRegistrosCsv() {
  const registros = aplicarBusquedaRegistros(getFiltered());
  if (registros.length === 0) { showToast('No hay registros para exportar'); return; }

  const headers = ['Fecha', 'Cliente', 'Teléfono', 'Carro', 'Color', 'Servicio', 'Cupón', 'Bebidas/Snacks', 'Periquitos', 'Métodos', 'Referencia', 'Monto', 'Moneda', 'Monto Bs', 'Monto $', 'Lavador', 'Porcentaje', 'Comisión', 'Propina', 'Estado', 'Observaciones'];
  const filas = registros.map(r => {
    const montos = awMontosRegistro(r);
    return [
      awFormatDateTime(r.fecha), r.cliente.nombre, r.cliente.telefono, r.carro?.modelo || '', r.carro?.color || '',
      awServiciosATexto(r.servicios), r.cuponAplicado ? (r.servicios || []).filter(s => s.cuponAplicado || s.cuponPorcentaje > 0).map(s => `${s.nombre}: ${s.cuponPorcentaje !== undefined ? s.cuponPorcentaje : 50}%`).join(' | ') : 'No', awBebidasATexto(r.bebidas),
      awPeriquitosATexto(r.periquitos),
      awPaymentSummary(r.pago), r.pago.referencia || '', montos.usd.toFixed(2), 'USD',
      montos.bs.toFixed(2), montos.usd.toFixed(2),
      r.lavador?.nombre || '—', r.porcentajeLavador || 0, `${(montos.bs * (r.porcentajeLavador || 0) / 100).toFixed(2)} Bs / ${(montos.usd * (r.porcentajeLavador || 0) / 100).toFixed(2)} USD`, r.propina.monto, r.estado, r.observaciones || ''
    ];
  });

  const csvEscape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autolavado_registros_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('CSV descargado');
}

/* ---------- Gastos del negocio ---------- */
async function onSubmitGasto(e) {
  e.preventDefault();
  if (awSucursalActivaAdmin === 'todas') { showToast('Selecciona una sucursal específica para registrar el gasto'); return; }
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const ok = await awAddGastoDb({
    fecha: new Date(document.getElementById('gastoFecha').value + 'T12:00:00').toISOString(),
    descripcion: document.getElementById('gastoDescripcion').value.trim(),
    categoria: document.getElementById('gastoCategoria').value.trim(),
    monto: parseFloat(document.getElementById('gastoMonto').value) || 0,
    moneda: document.getElementById('gastoMoneda').value,
    sucursalId: awSucursalActivaAdmin
  });
  btn.disabled = false;
  if (!ok) { showToast('No se pudo guardar el gasto'); return; }
  document.getElementById('form-gasto').reset();
  document.getElementById('gastoFecha').value = new Date().toISOString().slice(0, 10);
  showToast('Gasto registrado');
  awGastosCache = await awGetGastos();
  renderGastos();
  renderFromCache();
}

function renderGastos() {
  const tbody = document.getElementById('tablaGastos');
  const gastosVista = awFiltrarPorSucursalActiva(awGastosCache);
  const totalBs = sumBy(gastosVista.filter(g => g.moneda === 'Bs'), g => g.monto);
  const totalUsd = sumBy(gastosVista.filter(g => g.moneda === 'USD'), g => g.monto);
  document.getElementById('gastosResumenTxt').textContent = `Total: ${awFormatMoney(totalBs, 'Bs')} · ${awFormatMoney(totalUsd, 'USD')}`;

  if (gastosVista.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay gastos registrados todavía</td></tr>`;
    return;
  }
  tbody.innerHTML = gastosVista.map(g => `
    <tr>
      <td>${awFormatDateTime(g.fecha)}</td>
      <td>${g.categoria ? escapeHtml(g.categoria) : '—'}</td>
      <td>${escapeHtml(g.descripcion)}</td>
      <td>${awFormatMoney(g.monto, g.moneda)}</td>
      <td><button class="btn btn-danger btn-sm" data-del-gasto="${g.id}">Eliminar</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-del-gasto]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Eliminar este gasto?', async () => {
        await awDeleteGastoDb(btn.dataset.delGasto);
        showToast('Gasto eliminado');
        awGastosCache = await awGetGastos();
        renderGastos();
        renderFromCache();
      });
    });
  });
}

/* ---------- Servicios (guardado en lote, Bs auto por tasa) ---------- */
function renderServicios() {
  const cont = document.getElementById('listaServicios');
  const lista = awFiltrarPorSucursalActiva(awServiciosCache);
  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay servicios configurados todavía${awSucursalActivaAdmin !== 'todas' ? ' en esta sucursal' : ''}.</div>`;
    return;
  }
  cont.innerHTML = lista.map(s => `
    <div class="manage-item" data-servicio-id="${s.id}">
      <div class="mi-fields">
        ${awSucursalActivaAdmin === 'todas' ? `<div class="hint" style="flex-basis:100%; margin-bottom:-6px;">📍 ${escapeHtml(awNombreSucursal(s.sucursalId))}</div>` : ''}
        <div class="field"><label>Nombre</label><input type="text" value="${escapeAttr(s.nombre)}" data-field="nombre"></div>
        <div class="field"><label>Descripción</label><input type="text" value="${escapeAttr(s.descripcion || '')}" data-field="descripcion"></div>
        <div class="field"><label>Precio $</label><input type="number" step="0.01" min="0" value="${s.precioUsd}" data-field="precioUsd"></div>
        <div class="field"><label>Precio Bs (auto)</label><input type="number" step="0.01" value="${awPrecioBsEfectivo(s, awTasaCache).toFixed(2)}" data-field-bs readonly style="background:var(--bg-soft); color:var(--ink-soft);"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-danger btn-sm" data-del-servicio="${s.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  bindAutoBs(cont);

  cont.querySelectorAll('[data-del-servicio]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Eliminar este tipo de servicio? Los registros ya guardados no se verán afectados.', () => deleteServicio(btn.dataset.delServicio));
    });
  });
}

function bindAutoBs(container) {
  container.querySelectorAll('[data-field="precioUsd"]').forEach(input => {
    input.addEventListener('input', () => {
      const bsInput = input.closest('.manage-item').querySelector('[data-field-bs]');
      const usd = parseFloat(input.value) || 0;
      bsInput.value = (usd * awTasaCache).toFixed(2);
    });
  });
}

function addServicioLocal() {
  if (awSucursalActivaAdmin === 'todas') { showToast('Selecciona una sucursal específica para agregar servicios'); return; }
  awServiciosCache.push({ id: awTempId(), nombre: `Servicio nuevo`, descripcion: '', precioBs: 0, precioUsd: 0, sucursalId: awSucursalActivaAdmin, _nuevo: true });
  renderServicios();
}

async function guardarServicios() {
  const btn = document.getElementById('btnGuardarServicios');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  for (const s of awServiciosCache) {
    const item = document.querySelector(`[data-servicio-id="${s.id}"]`);
    if (!item) continue;
    const precioUsd = parseFloat(item.querySelector('[data-field="precioUsd"]').value) || 0;
    const cambios = {
      nombre: item.querySelector('[data-field="nombre"]').value.trim() || 'Servicio',
      descripcion: item.querySelector('[data-field="descripcion"]').value.trim(),
      precioUsd: precioUsd,
      precioBs: precioUsd * awTasaCache,
      sucursalId: s.sucursalId
    };
    if (s._nuevo) await awAddServicioDb(cambios);
    else await awUpdateServicioDb(s.id, cambios);
  }
  btn.disabled = false;
  btn.textContent = '💾 Guardar cambios';
  showToast('Servicios guardados');
  await renderAll();
}

async function deleteServicio(id) {
  if (!String(id).startsWith('new-')) await awDeleteServicioDb(id);
  awServiciosCache = awServiciosCache.filter(s => s.id !== id);
  renderServicios();
  showToast('Servicio eliminado');
}

/* ---------- Inventario (Periquitos): guardado en lote, Bs auto por tasa ---------- */
function renderInventario() {
  const cont = document.getElementById('listaInventario');
  if (!cont) return;
  const lista = awFiltrarPorSucursalActiva(awInventarioCache);
  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay artículos en el inventario todavía${awSucursalActivaAdmin !== 'todas' ? ' en esta sucursal' : ''}.</div>`;
    return;
  }
  cont.innerHTML = lista.map(item => {
    const stockBajo = item.cantidad <= 3;
    return `
    <div class="manage-item" data-inv-id="${item.id}">
      <div class="mi-fields">
        ${awSucursalActivaAdmin === 'todas' ? `<div class="hint" style="flex-basis:100%; margin-bottom:-6px;">📍 ${escapeHtml(awNombreSucursal(item.sucursalId))}</div>` : ''}
        <div class="field" style="max-width:110px;"><label>Código</label><input type="text" value="${escapeAttr(item.codigo)}" data-field="codigo"></div>
        <div class="field"><label>Descripción</label><input type="text" value="${escapeAttr(item.descripcion)}" data-field="descripcion"></div>
        <div class="field" style="max-width:90px;">
          <label>Cantidad${stockBajo ? ' ⚠️' : ''}</label>
          <input type="number" step="1" min="0" value="${item.cantidad}" data-field="cantidad" style="${stockBajo ? 'border-color:var(--danger); color:var(--danger); font-weight:700;' : ''}">
        </div>
        <div class="field"><label>Compra $</label><input type="number" step="0.01" min="0" value="${item.precioCompraUsd}" data-field="precioCompraUsd"></div>
        <div class="field"><label>Compra Bs (auto)</label><input type="number" step="0.01" value="${(item.precioCompraUsd * awTasaCache).toFixed(2)}" data-field-compra-bs readonly style="background:var(--bg-soft); color:var(--ink-soft);"></div>
        <div class="field"><label>Venta $</label><input type="number" step="0.01" min="0" value="${item.precioVentaUsd}" data-field="precioVentaUsd"></div>
        <div class="field"><label>Venta Bs (auto)</label><input type="number" step="0.01" value="${(item.precioVentaUsd * awTasaCache).toFixed(2)}" data-field-venta-bs readonly style="background:var(--bg-soft); color:var(--ink-soft);"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-danger btn-sm" data-del-inv="${item.id}">Eliminar</button>
      </div>
    </div>
  `;
  }).join('');

  cont.querySelectorAll('[data-field="precioCompraUsd"]').forEach(input => {
    input.addEventListener('input', () => {
      const bsInput = input.closest('.manage-item').querySelector('[data-field-compra-bs]');
      bsInput.value = ((parseFloat(input.value) || 0) * awTasaCache).toFixed(2);
    });
  });
  cont.querySelectorAll('[data-field="precioVentaUsd"]').forEach(input => {
    input.addEventListener('input', () => {
      const bsInput = input.closest('.manage-item').querySelector('[data-field-venta-bs]');
      bsInput.value = ((parseFloat(input.value) || 0) * awTasaCache).toFixed(2);
    });
  });

  cont.querySelectorAll('[data-del-inv]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Eliminar este artículo del inventario? Los registros ya guardados no se verán afectados.', () => deleteInventarioItem(btn.dataset.delInv));
    });
  });
}

function addInventarioLocal() {
  if (awSucursalActivaAdmin === 'todas') { showToast('Selecciona una sucursal específica para agregar artículos'); return; }
  awInventarioCache.push({ id: awTempId(), codigo: '', descripcion: 'Artículo nuevo', cantidad: 0, precioCompraUsd: 0, precioVentaUsd: 0, precioCompraBs: 0, precioVentaBs: 0, sucursalId: awSucursalActivaAdmin, _nuevo: true });
  renderInventario();
}

async function guardarInventario() {
  const btn = document.getElementById('btnGuardarInventario');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  for (const item of awInventarioCache) {
    const el = document.querySelector(`[data-inv-id="${item.id}"]`);
    if (!el) continue;
    const precioCompraUsd = parseFloat(el.querySelector('[data-field="precioCompraUsd"]').value) || 0;
    const precioVentaUsd = parseFloat(el.querySelector('[data-field="precioVentaUsd"]').value) || 0;
    const cambios = {
      codigo: el.querySelector('[data-field="codigo"]').value.trim(),
      descripcion: el.querySelector('[data-field="descripcion"]').value.trim() || 'Artículo',
      cantidad: parseInt(el.querySelector('[data-field="cantidad"]').value, 10) || 0,
      precioCompraUsd, precioVentaUsd,
      precioCompraBs: precioCompraUsd * awTasaCache,
      precioVentaBs: precioVentaUsd * awTasaCache,
      sucursalId: item.sucursalId
    };
    if (item._nuevo) await awAddInventarioDb(cambios);
    else await awUpdateInventarioDb(item.id, cambios);
  }
  btn.disabled = false;
  btn.textContent = '💾 Guardar cambios';
  showToast('Inventario guardado');
  await renderAll();
}

async function deleteInventarioItem(id) {
  if (!String(id).startsWith('new-')) await awDeleteInventarioDb(id);
  awInventarioCache = awInventarioCache.filter(i => i.id !== id);
  renderInventario();
  showToast('Artículo eliminado');
}

/* ---------- Carga masiva de Inventario (Excel/CSV) ---------- */
function descargarPlantillaInventario() {
  const headers = ['CODIGO', 'DESCRIPCION', 'CANTIDAD', 'PRECIO_COMPRA', 'PRECIO_VENTA'];
  const ejemplo = ['PER-001', 'Llavero de peluche', '10', '1.50', '3.00'];
  const csv = [headers, ejemplo].map(fila => fila.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_inventario.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Plantilla descargada. Precios en $ (el Bs se calcula solo).');
}

async function onCargaMasivaInventario(e) {
  const file = e.target.files[0];
  if (!file) return;
  const resultadoEl = document.getElementById('cargaMasivaResultado');
  resultadoEl.textContent = 'Leyendo archivo…';

  // La carga masiva siempre debe pertenecer a una sucursal concreta.
  // Nunca se importa/actualiza inventario cuando el filtro está en "Todas".
  if (awSucursalActivaAdmin === 'todas') {
    resultadoEl.textContent = 'Selecciona una sucursal específica antes de hacer una carga masiva.';
    showToast('Selecciona una sucursal específica para cargar inventario');
    e.target.value = '';
    return;
  }

  try {
    const filas = await leerArchivoInventario(file);
    if (filas.length === 0) {
      resultadoEl.textContent = 'El archivo no tiene filas válidas para importar.';
      e.target.value = '';
      return;
    }

    let actualizados = 0;
    let creados = 0;

    // Trabajamos exclusivamente con los artículos de la sucursal activa.
    // El mismo código puede existir en otra sucursal y NO debe tocarse.
    const inventarioSucursal = awInventarioCache.filter(
      i => i.sucursalId === awSucursalActivaAdmin
    );

    // Evita problemas si el archivo contiene el mismo código más de una vez.
    const existentesPorCodigo = new Map(
      inventarioSucursal.map(i => [String(i.codigo || '').trim().toLowerCase(), i])
    );

    for (const fila of filas) {
      const codigo = String(fila.codigo || '').trim();
      const clave = codigo.toLowerCase();
      if (!clave) continue;

      const existente = existentesPorCodigo.get(clave);

      if (existente) {
        const cantidadNueva = (Number(existente.cantidad) || 0) + (Number(fila.cantidad) || 0);
        await awUpdateInventarioDb(existente.id, {
          codigo: existente.codigo || codigo,
          descripcion: fila.descripcion || existente.descripcion,
          cantidad: cantidadNueva,
          precioCompraUsd: Number(fila.precioCompra) || 0,
          precioVentaUsd: Number(fila.precioVenta) || 0,
          precioCompraBs: (Number(fila.precioCompra) || 0) * awTasaCache,
          precioVentaBs: (Number(fila.precioVenta) || 0) * awTasaCache
        });

        // Mantiene la caché coherente para filas repetidas del mismo archivo.
        existente.cantidad = cantidadNueva;
        existente.descripcion = fila.descripcion || existente.descripcion;
        existente.precioCompraUsd = Number(fila.precioCompra) || 0;
        existente.precioVentaUsd = Number(fila.precioVenta) || 0;
        existente.precioCompraBs = (Number(fila.precioCompra) || 0) * awTasaCache;
        existente.precioVentaBs = (Number(fila.precioVenta) || 0) * awTasaCache;
        actualizados++;
      } else {
        const nuevo = {
          codigo,
          descripcion: fila.descripcion || 'Artículo',
          cantidad: Number(fila.cantidad) || 0,
          precioCompraUsd: Number(fila.precioCompra) || 0,
          precioVentaUsd: Number(fila.precioVenta) || 0,
          precioCompraBs: (Number(fila.precioCompra) || 0) * awTasaCache,
          precioVentaBs: (Number(fila.precioVenta) || 0) * awTasaCache,
          sucursalId: awSucursalActivaAdmin
        };

        await awAddInventarioDb(nuevo);
        creados++;

        // Lo agregamos al mapa local para que otra fila con el mismo código
        // se acumule en este mismo artículo y no cree un duplicado.
        existentesPorCodigo.set(clave, { ...nuevo, id: `bulk-${Date.now()}-${creados}` });
      }
    }

    // Recarga desde Supabase para confirmar que la vista y la caché quedan
    // alineadas con la sucursal activa.
    const inventarioActualizado = await awGetInventario();
    awInventarioCache = inventarioActualizado;

    resultadoEl.textContent = `Listo: ${creados} artículo(s) nuevo(s), ${actualizados} actualizado(s).`;
    showToast('Carga masiva completada');
    await renderAll();
  } catch (err) {
    console.error(err);
    resultadoEl.textContent = 'No se pudo completar la carga. Verifica el archivo y la sucursal seleccionada.';
  }
  e.target.value = '';
}

function leerArchivoInventario(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const primeraHoja = workbook.Sheets[workbook.SheetNames[0]];
        const filasCrudas = XLSX.utils.sheet_to_json(primeraHoja, { defval: '' });

        const filas = filasCrudas.map(row => {
          const get = (nombres) => {
            for (const n of nombres) {
              const key = Object.keys(row).find(k => k.trim().toUpperCase() === n);
              if (key !== undefined) return row[key];
            }
            return '';
          };
          return {
            codigo: String(get(['CODIGO', 'CÓDIGO'])).trim(),
            descripcion: String(get(['DESCRIPCION', 'DESCRIPCIÓN'])).trim(),
            cantidad: parseInt(get(['CANTIDAD']), 10) || 0,
            precioCompra: parseFloat(get(['PRECIO_COMPRA', 'PRECIO COMPRA'])) || 0,
            precioVenta: parseFloat(get(['PRECIO_VENTA', 'PRECIO VENTA'])) || 0
          };
        }).filter(f => f.codigo);

        resolve(filas);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ---------- Bebidas y Snacks (guardado en lote, con emoji, Bs auto por tasa) ---------- */
function renderBebidas() {
  const cont = document.getElementById('listaBebidas');
  const lista = awFiltrarPorSucursalActiva(awBebidasSnacksCache);
  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay bebidas/snacks configurados todavía${awSucursalActivaAdmin !== 'todas' ? ' en esta sucursal' : ''}.</div>`;
    return;
  }
  cont.innerHTML = lista.map(item => `
    <div class="manage-item" data-bebida-id="${item.id}">
      <div class="mi-fields">
        ${awSucursalActivaAdmin === 'todas' ? `<div class="hint" style="flex-basis:100%; margin-bottom:-6px;">📍 ${escapeHtml(awNombreSucursal(item.sucursalId))}</div>` : ''}
        <div class="field" style="max-width:90px;">
          <label>Emoji</label>
          <select data-field="emoji">
            ${AW_EMOJIS_BEBIDAS_SNACKS.map(e => `<option value="${e}" ${e === item.emoji ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label>Nombre</label><input type="text" value="${escapeAttr(item.nombre)}" data-field="nombre"></div>
        <div class="field"><label>Precio $</label><input type="number" step="0.01" min="0" value="${item.precioUsd}" data-field="precioUsd"></div>
        <div class="field"><label>Precio Bs (auto)</label><input type="number" step="0.01" value="${awPrecioBsEfectivo(item, awTasaCache).toFixed(2)}" data-field-bs readonly style="background:var(--bg-soft); color:var(--ink-soft);"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-danger btn-sm" data-del-bebida="${item.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  bindAutoBs(cont);

  cont.querySelectorAll('[data-del-bebida]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Eliminar este artículo? Los registros ya guardados no se verán afectados.', () => deleteBebida(btn.dataset.delBebida));
    });
  });
}

function addBebidaLocal() {
  if (awSucursalActivaAdmin === 'todas') { showToast('Selecciona una sucursal específica para agregar artículos'); return; }
  awBebidasSnacksCache.push({ id: awTempId(), nombre: 'Nuevo artículo', emoji: '🥤', precioBs: 0, precioUsd: 0, sucursalId: awSucursalActivaAdmin, _nuevo: true });
  renderBebidas();
}

async function guardarBebidas() {
  const btn = document.getElementById('btnGuardarBebidas');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  for (const item of awBebidasSnacksCache) {
    const el = document.querySelector(`[data-bebida-id="${item.id}"]`);
    if (!el) continue;
    const precioUsd = parseFloat(el.querySelector('[data-field="precioUsd"]').value) || 0;
    const cambios = {
      nombre: el.querySelector('[data-field="nombre"]').value.trim() || 'Artículo',
      emoji: el.querySelector('[data-field="emoji"]').value,
      precioUsd: precioUsd,
      precioBs: precioUsd * awTasaCache,
      sucursalId: item.sucursalId
    };
    if (item._nuevo) await awAddBebidaSnackDb(cambios);
    else await awUpdateBebidaSnackDb(item.id, cambios);
  }
  btn.disabled = false;
  btn.textContent = '💾 Guardar cambios';
  showToast('Bebidas y Snacks guardados');
  await renderAll();
}

async function deleteBebida(id) {
  if (!String(id).startsWith('new-')) await awDeleteBebidaSnackDb(id);
  awBebidasSnacksCache = awBebidasSnacksCache.filter(i => i.id !== id);
  renderBebidas();
  showToast('Artículo eliminado');
}

/* ---------- Lavadores (guardado en lote) ---------- */
function renderLavadores() {
  const cont = document.getElementById('listaLavadores');
  const lista = awFiltrarPorSucursalActiva(awLavadoresCache);
  if (lista.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay lavadores configurados todavía${awSucursalActivaAdmin !== 'todas' ? ' en esta sucursal' : ''}.</div>`;
    return;
  }
  cont.innerHTML = lista.map(l => `
    <div class="manage-item" data-lavador-id="${l.id}">
      <div class="mi-fields">
        ${awSucursalActivaAdmin === 'todas' ? `<div class="hint" style="flex-basis:100%; margin-bottom:-6px;">📍 ${escapeHtml(awNombreSucursal(l.sucursalId))}</div>` : ''}
        <div class="field"><label>Nombre</label><input type="text" value="${escapeAttr(l.nombre)}" data-field="nombre"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-danger btn-sm" data-del-lavador="${l.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-del-lavador]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Eliminar este lavador? Los registros ya guardados no se verán afectados.', () => deleteLavador(btn.dataset.delLavador));
    });
  });
}

function addLavadorLocal() {
  if (awSucursalActivaAdmin === 'todas') { showToast('Selecciona una sucursal específica para agregar lavadores'); return; }
  awLavadoresCache.push({ id: awTempId(), nombre: 'Lavador nuevo', sucursalId: awSucursalActivaAdmin, _nuevo: true });
  renderLavadores();
}

async function guardarLavadores() {
  const btn = document.getElementById('btnGuardarLavadores');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  for (const l of awLavadoresCache) {
    const el = document.querySelector(`[data-lavador-id="${l.id}"]`);
    if (!el) continue;
    const nombre = el.querySelector('[data-field="nombre"]').value.trim() || 'Lavador';
    if (l._nuevo) await awAddLavadorDb(nombre, l.sucursalId);
    else await awUpdateLavadorDb(l.id, nombre);
  }
  btn.disabled = false;
  btn.textContent = '💾 Guardar cambios';
  showToast('Lavadores guardados');
  await renderAll();
}

async function deleteLavador(id) {
  if (!String(id).startsWith('new-')) await awDeleteLavadorDb(id);
  awLavadoresCache = awLavadoresCache.filter(l => l.id !== id);
  renderLavadores();
  showToast('Lavador eliminado');
}

/* ---------- Modal de confirmación ---------- */
function bindModal() {
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalOkBtn').addEventListener('click', () => {
    if (awPendingDeleteAction) awPendingDeleteAction();
    closeModal();
  });
}

function confirmAction(text, action) {
  document.getElementById('modalConfirmText').textContent = text;
  awPendingDeleteAction = action;
  document.getElementById('modalConfirm').classList.add('open');
}

function closeModal() {
  document.getElementById('modalConfirm').classList.remove('open');
  awPendingDeleteAction = null;
}

/* ---------- Usuarios y niveles (solo Dueño) ---------- */
const AW_ROLES_DISPONIBLES = ['cajero', 'gerente', 'dueno'];

async function renderUsuarios() {
  const tbody = document.getElementById('tablaUsuarios');
  if (!tbody) return;
  const perfiles = await awGetPerfiles();
  if (perfiles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay usuarios registrados todavía</td></tr>`;
    return;
  }

  tbody.innerHTML = perfiles.map(p => {
    const esUnoMismo = p.id === awPerfilActual.id;
    const opcionesSucursal = awSucursalesCache.map(s => `<option value="${s.id}" ${s.id === p.sucursal_id ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('');
    let acciones = '';
    if (p.estado === 'pendiente') {
      acciones = `
        <div class="row-actions" style="flex-wrap:wrap;">
          <select data-nivel-nuevo="${p.id}">
            ${AW_ROLES_DISPONIBLES.map(r => `<option value="${r}" ${r === p.rol ? 'selected' : ''}>${AW_ROL_LABELS[r]}</option>`).join('')}
          </select>
          <select data-sucursal-nueva="${p.id}" style="${p.rol === 'cajero' ? '' : 'display:none;'}">${opcionesSucursal}</select>
          <button class="btn btn-primary btn-sm" data-aceptar="${p.id}">Aceptar</button>
          <button class="btn btn-danger btn-sm" data-rechazar="${p.id}">Rechazar</button>
        </div>`;
    } else if (p.estado === 'activo') {
      acciones = esUnoMismo ? '<span class="hint">Eres tú</span>' : `
        <div class="row-actions" style="flex-wrap:wrap;">
          <select data-cambiar-rol="${p.id}">
            ${AW_ROLES_DISPONIBLES.map(r => `<option value="${r}" ${r === p.rol ? 'selected' : ''}>${AW_ROL_LABELS[r]}</option>`).join('')}
          </select>
          <select data-cambiar-sucursal="${p.id}" style="${p.rol === 'cajero' ? '' : 'display:none;'}">${opcionesSucursal}</select>
          <button class="btn btn-danger btn-sm" data-revocar="${p.id}">Revocar acceso</button>
        </div>`;
    } else {
      acciones = `<button class="btn btn-primary btn-sm" data-reactivar="${p.id}">Reactivar</button>`;
    }

    return `
      <tr>
        <td>${escapeHtml(p.email)}</td>
        <td>${awFormatDateTime(p.created_at)}</td>
        <td><span class="badge ${p.estado === 'activo' ? 'pagado' : p.estado === 'rechazado' ? 'pendiente' : 'pendiente'}">${AW_ESTADO_PERFIL_LABELS[p.estado] || p.estado}</span></td>
        <td>${AW_ROL_LABELS[p.rol] || p.rol}${p.rol === 'cajero' ? `<br><span class="hint">📍 ${escapeHtml(awNombreSucursal(p.sucursal_id))}</span>` : ''}</td>
        <td>${acciones}</td>
      </tr>
    `;
  }).join('');

  // Mostrar/ocultar el select de sucursal según el nivel elegido
  tbody.querySelectorAll('[data-nivel-nuevo]').forEach(sel => {
    sel.addEventListener('change', () => {
      const selSucursal = tbody.querySelector(`[data-sucursal-nueva="${sel.dataset.nivelNuevo}"]`);
      if (selSucursal) selSucursal.style.display = sel.value === 'cajero' ? '' : 'none';
    });
  });
  tbody.querySelectorAll('[data-cambiar-rol]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const selSucursal = tbody.querySelector(`[data-cambiar-sucursal="${sel.dataset.cambiarRol}"]`);
      if (selSucursal) selSucursal.style.display = sel.value === 'cajero' ? '' : 'none';
      const cambios = { rol: sel.value };
      if (sel.value === 'cajero' && selSucursal) cambios.sucursal_id = selSucursal.value;
      const ok = await awActualizarPerfil(sel.dataset.cambiarRol, cambios);
      showToast(ok ? 'Nivel actualizado' : 'No se pudo actualizar');
      if (!ok) await renderUsuarios();
    });
  });

  tbody.querySelectorAll('[data-aceptar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sel = tbody.querySelector(`[data-nivel-nuevo="${btn.dataset.aceptar}"]`);
      const selSucursal = tbody.querySelector(`[data-sucursal-nueva="${btn.dataset.aceptar}"]`);
      if (sel.value === 'cajero' && (!selSucursal || !selSucursal.value)) {
        showToast('Selecciona la sucursal del cajero'); return;
      }
      const cambios = { estado: 'activo', rol: sel.value };
      if (sel.value === 'cajero') cambios.sucursal_id = selSucursal.value;
      const ok = await awActualizarPerfil(btn.dataset.aceptar, cambios);
      showToast(ok ? 'Usuario aceptado' : 'No se pudo actualizar');
      await renderUsuarios();
    });
  });
  tbody.querySelectorAll('[data-rechazar]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Rechazar el acceso de este usuario?', async () => {
        const ok = await awActualizarPerfil(btn.dataset.rechazar, { estado: 'rechazado' });
        showToast(ok ? 'Usuario rechazado' : 'No se pudo actualizar');
        await renderUsuarios();
      });
    });
  });
  tbody.querySelectorAll('[data-revocar]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction('¿Revocar el acceso de este usuario? No podrá volver a entrar hasta que lo reactives.', async () => {
        const ok = await awActualizarPerfil(btn.dataset.revocar, { estado: 'rechazado' });
        showToast(ok ? 'Acceso revocado' : 'No se pudo actualizar');
        await renderUsuarios();
      });
    });
  });
  tbody.querySelectorAll('[data-reactivar]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await awActualizarPerfil(btn.dataset.reactivar, { estado: 'activo' });
      showToast(ok ? 'Usuario reactivado' : 'No se pudo actualizar');
      await renderUsuarios();
    });
  });
}

/* ---------- Helpers ---------- */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str ?? '').replace(/"/g, '&quot;');
}
