/* =========================================================
   admin.js — lógica del panel administrativo
   ========================================================= */

let awPendingDeleteAction = null;

document.addEventListener('DOMContentLoaded', () => {
  awSeedIfEmpty();
  bindTabs();
  poblarFiltroSelects();
  bindFiltros();
  bindModal();
  document.getElementById('btnAddServicio').addEventListener('click', addServicio);
  document.getElementById('btnAddLavador').addEventListener('click', addLavador);
  renderAll();
});

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
  const lavadores = awGetLavadores();
  const servicios = awGetServicios();
  const selL = document.getElementById('filtroLavador');
  const selS = document.getElementById('filtroServicio');
  selL.innerHTML = '<option value="">Todos</option>' + lavadores.map(l => `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`).join('');
  selS.innerHTML = '<option value="">Todos</option>' + servicios.map(s => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
}

function bindFiltros() {
  ['filtroDesde', 'filtroHasta', 'filtroEstado', 'filtroLavador', 'filtroServicio'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderAll);
  });
  document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
    ['filtroDesde', 'filtroHasta', 'filtroEstado', 'filtroLavador', 'filtroServicio'].forEach(id => {
      document.getElementById(id).value = '';
    });
    renderAll();
  });
}

function getFiltered() {
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const estado = document.getElementById('filtroEstado').value;
  const lavadorId = document.getElementById('filtroLavador').value;
  const servicioId = document.getElementById('filtroServicio').value;

  return awGetRegistros().filter(r => {
    const fecha = new Date(r.fecha);
    if (desde && fecha < new Date(desde + 'T00:00:00')) return false;
    if (hasta && fecha > new Date(hasta + 'T23:59:59')) return false;
    if (estado && r.estado !== estado) return false;
    if (lavadorId && r.lavador.id !== lavadorId) return false;
    if (servicioId && r.servicio.id !== servicioId) return false;
    return true;
  });
}

function renderAll() {
  const filtrados = getFiltered();
  renderResumen(filtrados);
  renderTablaRegistros(filtrados);
  renderServicios();
  renderLavadores();
}

/* ---------- Resumen (KPIs) ---------- */
function renderResumen(registros) {
  const pagados = registros.filter(r => r.estado === 'PAGADO');
  const pendientes = registros.filter(r => r.estado === 'PENDIENTE');

  const totalBs = sumBy(pagados.filter(r => r.pago.moneda === 'Bs'), r => r.pago.monto);
  const totalUsd = sumBy(pagados.filter(r => r.pago.moneda === 'USD'), r => r.pago.monto);
  const propinaBs = sumBy(registros.filter(r => r.propina.moneda === 'Bs'), r => r.propina.monto);
  const propinaUsd = sumBy(registros.filter(r => r.propina.moneda === 'USD'), r => r.propina.monto);

  const kpis = [
    { label: 'Registros filtrados', value: registros.length, sub: `${pagados.length} pagados` },
    { label: 'Total cobrado (Bs)', value: awFormatMoney(totalBs, 'Bs'), sub: 'Solo lavados pagados' },
    { label: 'Total cobrado ($)', value: awFormatMoney(totalUsd, 'USD'), sub: 'Solo lavados pagados' },
    { label: 'Pendientes por cobrar', value: pendientes.length, sub: pendientes.length ? 'Requieren seguimiento' : 'Al día 🎉' },
    { label: 'Propinas (Bs)', value: awFormatMoney(propinaBs, 'Bs'), sub: '' },
    { label: 'Propinas ($)', value: awFormatMoney(propinaUsd, 'USD'), sub: '' },
    { label: 'Bebidas consumidas', value: sumBy(registros, r => r.bebidas.cerveza + r.bebidas.refresco + r.bebidas.energizante), sub: 'Cerveza + Refresco + Energizante' },
    { label: 'Carros lavados', value: registros.length, sub: 'En el período filtrado' }
  ];

  document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${escapeHtml(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${escapeHtml(k.sub || '')}</div>
    </div>
  `).join('');

  // Comisiones por lavador
  const porLavador = {};
  pagados.forEach(r => {
    const key = r.lavador.id + '|' + r.lavador.nombre;
    if (!porLavador[key]) porLavador[key] = { nombre: r.lavador.nombre, cantidad: 0, totalBs: 0, totalUsd: 0, comisionBs: 0, comisionUsd: 0 };
    porLavador[key].cantidad += 1;
    const comision = r.pago.monto * (r.porcentajeLavador / 100);
    if (r.pago.moneda === 'USD') {
      porLavador[key].totalUsd += r.pago.monto;
      porLavador[key].comisionUsd += comision;
    } else {
      porLavador[key].totalBs += r.pago.monto;
      porLavador[key].comisionBs += comision;
    }
  });

  const filas = Object.values(porLavador);
  document.getElementById('tablaComisiones').innerHTML = filas.length ? filas.map(f => `
    <tr>
      <td>${escapeHtml(f.nombre)}</td>
      <td>${f.cantidad}</td>
      <td>${awFormatMoney(f.totalBs, 'Bs')} · ${awFormatMoney(f.totalUsd, 'USD')}</td>
      <td>${awFormatMoney(f.comisionBs, 'Bs')} · ${awFormatMoney(f.comisionUsd, 'USD')}</td>
    </tr>
  `).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--ink-soft);padding:20px;">No hay lavados pagados en este período</td></tr>`;
}

function sumBy(arr, fn) { return arr.reduce((acc, x) => acc + (fn(x) || 0), 0); }

/* ---------- Tabla de registros ---------- */
function renderTablaRegistros(registros) {
  document.getElementById('registrosCount').textContent = `${registros.length} registro${registros.length === 1 ? '' : 's'}`;
  const tbody = document.getElementById('tablaRegistros');

  if (registros.length === 0) {
    tbody.innerHTML = `<tr><td colspan="15" style="text-align:center;color:var(--ink-soft);padding:24px;">No hay registros con estos filtros</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map(r => {
    const bebidasTxt = Object.entries(r.bebidas).filter(([, v]) => v > 0).map(([k, v]) => `${v}×${k[0].toUpperCase()}`).join(' ') || '—';
    const comision = r.pago.monto * (r.porcentajeLavador / 100);
    const propinaTxt = r.propina.monto > 0 ? awFormatMoney(r.propina.monto, r.propina.moneda) : '—';
    return `
      <tr>
        <td>${awFormatDateTime(r.fecha)}</td>
        <td>${escapeHtml(r.cliente.nombre)}</td>
        <td>${escapeHtml(r.cliente.telefono)}</td>
        <td>${escapeHtml(r.carro.modelo)} (${escapeHtml(r.carro.color)})</td>
        <td>${escapeHtml(r.servicio.nombre)}</td>
        <td>${bebidasTxt}</td>
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
        () => { awDeleteRegistro(btn.dataset.delRegistro); showToast('Registro eliminado'); renderAll(); }
      );
    });
  });
}

/* ---------- Servicios ---------- */
function renderServicios() {
  const servicios = awGetServicios();
  const cont = document.getElementById('listaServicios');
  if (servicios.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay servicios configurados todavía.</div>`;
    return;
  }
  cont.innerHTML = servicios.map(s => `
    <div class="manage-item" data-servicio-id="${s.id}">
      <div class="mi-fields">
        <div class="field"><label>Nombre</label><input type="text" value="${escapeAttr(s.nombre)}" data-field="nombre"></div>
        <div class="field"><label>Descripción</label><input type="text" value="${escapeAttr(s.descripcion || '')}" data-field="descripcion"></div>
        <div class="field"><label>Precio Bs</label><input type="number" step="0.01" min="0" value="${s.precioBs}" data-field="precioBs"></div>
        <div class="field"><label>Precio $</label><input type="number" step="0.01" min="0" value="${s.precioUsd}" data-field="precioUsd"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary btn-sm" data-save-servicio="${s.id}">Guardar</button>
        <button class="btn btn-danger btn-sm" data-del-servicio="${s.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-save-servicio]').forEach(btn => {
    btn.addEventListener('click', () => saveServicio(btn.dataset.saveServicio));
  });
  cont.querySelectorAll('[data-del-servicio]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction(
        '¿Eliminar este tipo de servicio? Los registros ya guardados no se verán afectados.',
        () => { deleteServicio(btn.dataset.delServicio); }
      );
    });
  });
}

function addServicio() {
  const servicios = awGetServicios();
  servicios.push({ id: awUid(), nombre: `Servicio ${servicios.length + 1}`, descripcion: '', precioBs: 0, precioUsd: 0 });
  awSaveServicios(servicios);
  renderServicios();
  poblarFiltroSelects();
  showToast('Servicio agregado');
}

function saveServicio(id) {
  const item = document.querySelector(`[data-servicio-id="${id}"]`);
  const servicios = awGetServicios();
  const idx = servicios.findIndex(s => s.id === id);
  if (idx === -1) return;
  servicios[idx] = {
    ...servicios[idx],
    nombre: item.querySelector('[data-field="nombre"]').value.trim() || servicios[idx].nombre,
    descripcion: item.querySelector('[data-field="descripcion"]').value.trim(),
    precioBs: parseFloat(item.querySelector('[data-field="precioBs"]').value) || 0,
    precioUsd: parseFloat(item.querySelector('[data-field="precioUsd"]').value) || 0
  };
  awSaveServicios(servicios);
  poblarFiltroSelects();
  showToast('Servicio actualizado');
}

function deleteServicio(id) {
  awSaveServicios(awGetServicios().filter(s => s.id !== id));
  renderServicios();
  poblarFiltroSelects();
  showToast('Servicio eliminado');
}

/* ---------- Lavadores ---------- */
function renderLavadores() {
  const lavadores = awGetLavadores();
  const cont = document.getElementById('listaLavadores');
  if (lavadores.length === 0) {
    cont.innerHTML = `<div class="empty-state">No hay lavadores configurados todavía.</div>`;
    return;
  }
  cont.innerHTML = lavadores.map(l => `
    <div class="manage-item" data-lavador-id="${l.id}">
      <div class="mi-fields">
        <div class="field"><label>Nombre</label><input type="text" value="${escapeAttr(l.nombre)}" data-field="nombre"></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-primary btn-sm" data-save-lavador="${l.id}">Guardar</button>
        <button class="btn btn-danger btn-sm" data-del-lavador="${l.id}">Eliminar</button>
      </div>
    </div>
  `).join('');

  cont.querySelectorAll('[data-save-lavador]').forEach(btn => {
    btn.addEventListener('click', () => saveLavador(btn.dataset.saveLavador));
  });
  cont.querySelectorAll('[data-del-lavador]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmAction(
        '¿Eliminar este lavador? Los registros ya guardados no se verán afectados.',
        () => { deleteLavador(btn.dataset.delLavador); }
      );
    });
  });
}

function addLavador() {
  const lavadores = awGetLavadores();
  lavadores.push({ id: awUid(), nombre: `Lavador ${lavadores.length + 1}` });
  awSaveLavadores(lavadores);
  renderLavadores();
  poblarFiltroSelects();
  showToast('Lavador agregado');
}

function saveLavador(id) {
  const item = document.querySelector(`[data-lavador-id="${id}"]`);
  const lavadores = awGetLavadores();
  const idx = lavadores.findIndex(l => l.id === id);
  if (idx === -1) return;
  lavadores[idx].nombre = item.querySelector('[data-field="nombre"]').value.trim() || lavadores[idx].nombre;
  awSaveLavadores(lavadores);
  poblarFiltroSelects();
  showToast('Lavador actualizado');
}

function deleteLavador(id) {
  awSaveLavadores(awGetLavadores().filter(l => l.id !== id));
  renderLavadores();
  poblarFiltroSelects();
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
