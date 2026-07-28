/* =========================================================
   admin.js — lógica del panel administrativo
   ========================================================= */

let awPendingDeleteAction = null;
let awServiciosCache = [];
let awLavadoresCache = [];
let awBebidasSnacksCache = [];
let awRegistrosCache = [];
let awGastosCache = [];
let awTasaCache = 1;
let awNewIdCounter = 0;

function awTempId() { return `new-${++awNewIdCounter}`; }

document.addEventListener('DOMContentLoaded', () => {
  bindLoginForm();
  bindLogoutButton();
  bindPasswordToggle();
  awSupabase.auth.onAuthStateChange((_event, session) => {
    if (session) mostrarPanelAdmin(session);
    else mostrarPantallaLogin();
  });
  awSupabase.auth.getSession().then(({ data: { session } }) => {
    if (session) mostrarPanelAdmin(session);
    else mostrarPantallaLogin();
  });
});

/* ---------- Login / sesión ---------- */
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

function bindLogoutButton() {
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await awSupabase.auth.signOut();
  });
}

function mostrarPantallaLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminContent').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  document.getElementById('logoutEmail').style.display = 'none';
  document.getElementById('tasaWidget').style.display = 'none';
}

function mostrarPanelAdmin(session) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminContent').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  document.getElementById('logoutEmail').style.display = 'inline';
  document.getElementById('logoutEmail').textContent = session.user.email;
  document.getElementById('tasaWidget').style.display = 'flex';
  initAdminPanel();
}

let awAdminInicializado = false;
function initAdminPanel() {
  if (awAdminInicializado) { renderAll(); return; }
  awAdminInicializado = true;
  bindTabs();
  bindFiltros();
  bindModal();
  document.getElementById('btnAddServicio').addEventListener('click', addServicioLocal);
  document.getElementById('btnGuardarServicios').addEventListener('click', guardarServicios);
  document.getElementById('btnAddBebida').addEventListener('click', addBebidaLocal);
  document.getElementById('btnGuardarBebidas').addEventListener('click', guardarBebidas);
  document.getElementById('btnAddLavador').addEventListener('click', addLavadorLocal);
  document.getElementById('btnGuardarLavadores').addEventListener('click', guardarLavadores);
  document.getElementById('form-gasto').addEventListener('submit', onSubmitGasto);
  document.getElementById('btnExportarCsv').addEventListener('click', exportarRegistrosCsv);
  document.getElementById('btnGuardarTasa').addEventListener('click', guardarTasa);
  document.getElementById('gastoFecha').value = new Date().toISOString().slice(0, 10);
  renderAll();
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
  document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
    ['filtroDesde', 'filtroHasta', 'filtroEstado', 'filtroLavador', 'filtroServicio'].forEach(id => {
      document.getElementById(id).value = '';
    });
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
    if (lavadorId && r.lavador.id !== lavadorId) return false;
    if (servicioId && r.servicio.id !== servicioId) return false;
    return true;
  });
}

/* Devuelve {bs, usd} a cobrar de un registro, siempre completos (incluye Periquitos
   sin importar en qué moneda se haya cargado), usando lo guardado en pago.montoBs/montoUsd
   con respaldo (tickets viejos) al cálculo simple por pago.monto/pago.moneda. */
function awMontosRegistro(r) {
  if (typeof r.pago.montoBs === 'number' && typeof r.pago.montoUsd === 'number') {
    return { bs: r.pago.montoBs, usd: r.pago.montoUsd };
  }
  return awConvertir(r.pago.monto, r.pago.moneda, r.pago.tasaUsada || awTasaCache || 1);
}

/* renderAll: recarga todo desde la base de datos */
async function renderAll() {
  const [servicios, lavadores, bebidas, registros, gastos, tasa] = await Promise.all([
    awGetServicios(),
    awGetLavadores(),
    awGetBebidasSnacks(),
    awGetRegistros(),
    awGetGastos(),
    awGetTasa()
  ]);
  awServiciosCache = servicios;
  awLavadoresCache = lavadores;
  awBebidasSnacksCache = bebidas;
  awRegistrosCache = registros;
  awGastosCache = gastos;
  awTasaCache = tasa;
  document.getElementById('tasaInput').value = tasa;

  poblarFiltroSelects();
  renderFromCache();
  renderServicios();
  renderBebidas();
  renderLavadores();
  renderGastos();
}

/* renderFromCache: solo re-pinta con lo que ya está en memoria (filtros, sin red) */
function renderFromCache() {
  const filtrados = getFiltered();
  renderResumen(filtrados);
  renderTablaRegistros(filtrados);
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
    tablaPendientes.innerHTML = pendientes.length ? pendientes.map(r => `
      <tr>
        <td>${escapeHtml(r.cliente.nombre)}</td>
        <td>${escapeHtml(r.cliente.telefono)}</td>
        <td>${escapeHtml(r.carro.modelo)} (${escapeHtml(r.carro.color)})</td>
        <td>${escapeHtml(r.servicio.nombre)}</td>
        <td>${awFormatMoney(r.pago.monto, r.pago.moneda)}</td>
        <td>${awFormatDateTime(r.fecha)}</td>
      </tr>
    `).join('') : `<tr><td colspan="6" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay clientes con pago pendiente 🎉</td></tr>`;
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

/* ---------- Tabla de registros ---------- */
function renderTablaRegistros(registros) {
  document.getElementById('registrosCount').textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;
  const tbody = document.getElementById('tablaRegistros');

  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="16" style="text-align:center;color:var(--ink-soft);padding:24px;">No hay registros con estos filtros</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const bebidasTxt = awBebidasATexto(r.bebidas);
    const periquitosTxt = r.periquitos && r.periquitos.monto > 0 ? awFormatMoney(r.periquitos.monto, r.periquitos.moneda) : '—';
    const comision = r.pago.monto * (r.porcentajeLavador / 100);
    const propinaTxt = r.propina.monto > 0 ? awFormatMoney(r.propina.monto, r.propina.moneda) : '—';
    const accionPendiente = r.estado === 'PENDIENTE'
      ? `<a class="btn btn-whatsapp btn-sm" href="${awWhatsAppLinkPendiente(r)}" target="_blank" rel="noopener">💬 Recordar</a>`
      : '';
    return `
      <tr>
        <td>${awFormatDateTime(r.fecha)}</td>
        <td>${escapeHtml(r.cliente.nombre)}</td>
        <td>${escapeHtml(r.cliente.telefono)}</td>
        <td>${escapeHtml(r.carro.modelo)} (${escapeHtml(r.carro.color)})</td>
        <td>${escapeHtml(r.servicio.nombre)}</td>
        <td>${escapeHtml(bebidasTxt)}</td>
        <td>${periquitosTxt}</td>
        <td>${awPaymentLabel(r.pago.metodo)}</td>
        <td>${r.pago.referencia ? escapeHtml(r.pago.referencia) : '—'}</td>
        <td>${awFormatMoney(r.pago.monto, r.pago.moneda)}</td>
        <td>${escapeHtml(r.lavador.nombre)}</td>
        <td>${r.porcentajeLavador}%</td>
        <td>${awFormatMoney(comision, r.pago.moneda)}</td>
        <td>${propinaTxt}</td>
        <td><span class="badge ${r.estado.toLowerCase()}">${r.estado}</span></td>
        <td>
          <div class="row-actions">
            ${accionPendiente}
            <button class="btn btn-danger btn-sm" data-del-registro="${r.id}">Eliminar</button>
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

function awWhatsAppLinkPendiente(r) {
  const numero = awNormalizarTelefonoVE(r.cliente.telefono);
  const mensaje = `Hola, buenas Sr(a) ${r.cliente.nombre}, le escribimos de AUTOLAVADO para recordarle que el servicio de su vehículo ${r.carro.modelo} quedó con un saldo pendiente de ${awFormatMoney(r.pago.monto, r.pago.moneda)}. Quedamos atentos para coordinar el pago, ¡gracias por su preferencia!`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/* ---------- Exportar CSV ---------- */
function exportarRegistrosCsv() {
  const registros = getFiltered();
  if (registros.length === 0) { showToast('No hay registros para exportar'); return; }

  const headers = ['Fecha', 'Cliente', 'Teléfono', 'Carro', 'Color', 'Servicio', 'Bebidas/Snacks', 'Periquitos', 'Método', 'Referencia', 'Monto', 'Moneda', 'Monto Bs', 'Monto $', 'Lavador', 'Porcentaje', 'Comisión', 'Propina', 'Estado'];
  const filas = registros.map(r => {
    const comision = r.pago.monto * (r.porcentajeLavador / 100);
    const montos = awMontosRegistro(r);
    return [
      awFormatDateTime(r.fecha), r.cliente.nombre, r.cliente.telefono, r.carro.modelo, r.carro.color,
      r.servicio.nombre, awBebidasATexto(r.bebidas),
      r.periquitos && r.periquitos.monto > 0 ? `${r.periquitos.descripcion} ${r.periquitos.monto}` : '',
      awPaymentLabel(r.pago.metodo), r.pago.referencia || '', r.pago.monto, r.pago.moneda,
      montos.bs.toFixed(2), montos.usd.toFixed(2),
      r.lavador.nombre, r.porcentajeLavador, comision.toFixed(2), r.propina.monto, r.estado
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
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  const ok = await awAddGastoDb({
    fecha: new Date(document.getElementById('gastoFecha').value + 'T12:00:00').toISOString(),
    descripcion: document.getElementById('gastoDescripcion').value.trim(),
    categoria: document.getElementById('gastoCategoria').value.trim(),
    monto: parseFloat(document.getElementById('gastoMonto').value) || 0,
    moneda: document.getElementById('gastoMoneda').value
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
  const totalBs = sumBy(awGastosCache.filter(g => g.moneda === 'Bs'), g => g.monto);
  const totalUsd = sumBy(awGastosCache.filter(g => g.moneda === 'USD'), g => g.monto);
  document.getElementById('gastosResumenTxt').textContent = `Total: ${awFormatMoney(totalBs, 'Bs')} · ${awFormatMoney(totalUsd, 'USD')}`;

  if (awGastosCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay gastos registrados todavía</td></tr>`;
    return;
  }
  tbody.innerHTML = awGastosCache.map(g => `
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
  if (awServiciosCache.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay servicios configurados todavía.</div>`;
    return;
  }
  cont.innerHTML = awServiciosCache.map(s => `
    <div class="manage-item" data-servicio-id="${s.id}">
      <div class="mi-fields">
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
  awServiciosCache.push({ id: awTempId(), nombre: `Servicio nuevo`, descripcion: '', precioBs: 0, precioUsd: 0, _nuevo: true });
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
      precioBs: precioUsd * awTasaCache
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

/* ---------- Bebidas y Snacks (guardado en lote, con emoji, Bs auto por tasa) ---------- */
function renderBebidas() {
  const cont = document.getElementById('listaBebidas');
  if (awBebidasSnacksCache.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay bebidas/snacks configurados todavía.</div>`;
    return;
  }
  cont.innerHTML = awBebidasSnacksCache.map(item => `
    <div class="manage-item" data-bebida-id="${item.id}">
      <div class="mi-fields">
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
  awBebidasSnacksCache.push({ id: awTempId(), nombre: 'Nuevo artículo', emoji: '🥤', precioBs: 0, precioUsd: 0, _nuevo: true });
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
      precioBs: precioUsd * awTasaCache
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
  if (awLavadoresCache.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay lavadores configurados todavía.</div>`;
    return;
  }
  cont.innerHTML = awLavadoresCache.map(l => `
    <div class="manage-item" data-lavador-id="${l.id}">
      <div class="mi-fields">
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
  awLavadoresCache.push({ id: awTempId(), nombre: 'Lavador nuevo', _nuevo: true });
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
    if (l._nuevo) await awAddLavadorDb(nombre);
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
