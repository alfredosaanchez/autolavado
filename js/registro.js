/* =========================================================
   registro.js — lógica de la página principal de registro
   ========================================================= */

let awDrinkCounts = {}; // { itemId: cantidad }
let awServiciosCache = [];
let awLavadoresCache = [];
let awBebidasSnacksCache = [];
let awTasaCache = 1;
let awTicketsHoyCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  bindMetodoPago();
  bindServicioChange();
  document.getElementById('montoTotal').addEventListener('input', (e) => {
    e.target.dataset.touched = '1';
  });
  document.getElementById('form-registro').addEventListener('submit', onSubmitRegistro);
  document.getElementById('buscadorTickets').addEventListener('input', renderTicketsFiltrados);
  await cargarConfiguracion();
  await renderTickets();
});

/* ---------- Cargar servicios / lavadores / bebidas / tasa y poblar selects ---------- */
async function cargarConfiguracion() {
  const sel = document.getElementById('servicioSelect');
  const selLav = document.getElementById('lavadorSelect');
  sel.innerHTML = '<option value="">Cargando…</option>';
  selLav.innerHTML = '<option value="">Cargando…</option>';

  const [servicios, lavadores, bebidasSnacks, tasa, permitirFechaPasada] = await Promise.all([
    awGetServicios(),
    awGetLavadores(),
    awGetBebidasSnacks(),
    awGetTasa(),
    awGetPermitirFechaPasada()
  ]);
  awServiciosCache = servicios;
  awLavadoresCache = lavadores;
  awBebidasSnacksCache = bebidasSnacks;
  awTasaCache = tasa;
  awDrinkCounts = {};
  bebidasSnacks.forEach(item => { awDrinkCounts[item.id] = 0; });

  document.getElementById('tasaDisplay').textContent = awFormatMoney(awTasaCache, 'Bs');
  document.getElementById('fechaPasadaSection').style.display = permitirFechaPasada ? 'block' : 'none';

  sel.innerHTML = servicios.map(s =>
    `<option value="${s.id}">${escapeHtml(s.nombre)}${s.descripcion ? ' — ' + escapeHtml(s.descripcion) : ''}</option>`
  ).join('') || '<option value="">No hay servicios configurados</option>';

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

function bindServicioChange() {
  document.getElementById('servicioSelect').addEventListener('change', actualizarHintPrecio);
  document.getElementById('monedaPago').addEventListener('change', actualizarHintPrecio);
  document.getElementById('periquitosMonto').addEventListener('input', actualizarHintPrecio);
  document.getElementById('periquitosMoneda').addEventListener('change', actualizarHintPrecio);
  document.getElementById('periquitosDesc').addEventListener('input', actualizarHintPrecio);
}

/* ---------- Resumen de cobro (usa la tasa para que TODO cuadre en ambas monedas) ---------- */
function actualizarHintPrecio() {
  const id = document.getElementById('servicioSelect').value;
  const moneda = document.getElementById('monedaPago').value;
  const s = awServiciosCache.find(x => x.id === id);
  const tasa = awTasaCache || 1;

  const precioServicioUsd = s ? (s.precioUsd || 0) : 0;
  const precioServicioBs = s ? awPrecioBsEfectivo(s, tasa) : 0;
  const bebidasBs = awCalcularCostoBebidas(awDrinkCounts, 'Bs', awBebidasSnacksCache, tasa);
  const bebidasUsd = awCalcularCostoBebidas(awDrinkCounts, 'USD', awBebidasSnacksCache, tasa);

  const periquitosMonto = parseFloat(document.getElementById('periquitosMonto').value) || 0;
  const periquitosMoneda = document.getElementById('periquitosMoneda').value;
  const periquitosConv = awConvertir(periquitosMonto, periquitosMoneda, tasa);

  const totalBs = precioServicioBs + bebidasBs + periquitosConv.bs;
  const totalUsd = precioServicioUsd + bebidasUsd + periquitosConv.usd;

  document.getElementById('resumenServicioTxt').textContent = s
    ? `${s.nombre} — ${awFormatMoney(precioServicioBs, 'Bs')} / ${awFormatMoney(precioServicioUsd, 'USD')}`
    : 'Selecciona un servicio';

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
  if (periquitosMonto > 0) {
    const desc = document.getElementById('periquitosDesc').value.trim();
    document.getElementById('resumenPeriquitosTxt').textContent = `${desc ? desc + ' — ' : ''}${awFormatMoney(periquitosConv.bs, 'Bs')} / ${awFormatMoney(periquitosConv.usd, 'USD')}`;
    periquitosLinea.style.display = 'flex';
  } else {
    periquitosLinea.style.display = 'none';
  }

  document.getElementById('resumenTotalBs').textContent = awFormatMoney(totalBs, 'Bs');
  document.getElementById('resumenTotalUsd').textContent = awFormatMoney(totalUsd, 'USD');

  const hint = document.getElementById('servicioPrecioHint');
  const totalMoneda = moneda === 'USD' ? totalUsd : totalBs;
  hint.textContent = s ? `Se sugiere cobrar ${awFormatMoney(totalMoneda, moneda)} en ${moneda}. (Tasa: ${awFormatMoney(tasa, 'Bs')}/$)` : '';

  const montoInput = document.getElementById('montoTotal');
  if (!montoInput.dataset.touched) {
    montoInput.value = totalMoneda || '';
  }
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

/* ---------- Método de pago ---------- */
function bindMetodoPago() {
  const radios = document.querySelectorAll('input[name="metodoPago"]');
  radios.forEach(r => r.addEventListener('change', updateReferenciaVisibility));
  updateReferenciaVisibility();
}

function updateReferenciaVisibility() {
  const metodo = document.querySelector('input[name="metodoPago"]:checked').value;
  const wrap = document.getElementById('referenciaWrap');
  const refInput = document.getElementById('referenciaPago');
  if (metodo === 'pendiente' || metodo === 'efectivo') {
    wrap.style.opacity = '0.5';
    refInput.removeAttribute('required');
  } else {
    wrap.style.opacity = '1';
    refInput.setAttribute('required', 'required');
  }
}

/* ---------- Envío del formulario ---------- */
async function onSubmitRegistro(e) {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';

  const metodo = document.querySelector('input[name="metodoPago"]:checked').value;
  const servicioId = document.getElementById('servicioSelect').value;
  const lavadorId = document.getElementById('lavadorSelect').value;
  const servicio = awServiciosCache.find(s => s.id === servicioId);
  const lavador = awLavadoresCache.find(l => l.id === lavadorId);

  const monedaPago = document.getElementById('monedaPago').value;
  const montoFinal = parseFloat(document.getElementById('montoTotal').value) || 0;
  const conv = awConvertir(montoFinal, monedaPago, awTasaCache);

  const fechaPasadaInput = document.getElementById('fechaRegistroPasada');
  let fechaFinal = new Date().toISOString();
  if (fechaPasadaInput && fechaPasadaInput.value) {
    const ahora = new Date();
    const [anio, mes, dia] = fechaPasadaInput.value.split('-').map(Number);
    fechaFinal = new Date(anio, mes - 1, dia, ahora.getHours(), ahora.getMinutes(), ahora.getSeconds()).toISOString();
  }

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
    servicio: { id: servicioId, nombre: servicio ? servicio.nombre : '—' },
    bebidas: awBebidasSnacksCache
      .filter(item => (awDrinkCounts[item.id] || 0) > 0)
      .map(item => ({
        id: item.id,
        nombre: item.nombre,
        emoji: item.emoji,
        cantidad: awDrinkCounts[item.id],
        precioBs: awPrecioBsEfectivo(item, awTasaCache),
        precioUsd: item.precioUsd
      })),
    periquitos: {
      descripcion: document.getElementById('periquitosDesc').value.trim(),
      monto: parseFloat(document.getElementById('periquitosMonto').value) || 0,
      moneda: document.getElementById('periquitosMoneda').value
    },
    pago: {
      metodo: metodo,
      moneda: monedaPago,
      monto: montoFinal,
      montoBs: conv.bs,
      montoUsd: conv.usd,
      referencia: document.getElementById('referenciaPago').value.trim(),
      tasaUsada: awTasaCache
    },
    lavador: { id: lavadorId, nombre: lavador ? lavador.nombre : '—' },
    porcentajeLavador: parseFloat(document.getElementById('porcentajeLavador').value) || 0,
    propina: {
      monto: parseFloat(document.getElementById('propinaMonto').value) || 0,
      moneda: document.getElementById('propinaMoneda').value,
      referencia: document.getElementById('propinaReferencia').value.trim()
    },
    estado: metodo === 'pendiente' ? 'PENDIENTE' : 'PAGADO'
  };

  const ok = await awAddRegistro(registro);
  submitBtn.disabled = false;
  submitBtn.textContent = 'Registrar lavado';

  if (!ok) {
    showToast('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    return;
  }
  showToast(metodo === 'pendiente' ? 'Registrado como PENDIENTE' : 'Lavado registrado correctamente');
  resetForm();
  await renderTickets();
}

function resetForm() {
  document.getElementById('form-registro').reset();
  awBebidasSnacksCache.forEach(item => { awDrinkCounts[item.id] = 0; });
  document.querySelectorAll('#drinkGrid .stepper span').forEach(span => { span.textContent = '0'; });
  document.getElementById('montoTotal').dataset.touched = '';
  updateReferenciaVisibility();
  actualizarHintPrecio();
}

/* ---------- Render de tickets del día ---------- */
async function renderTickets() {
  const list = document.getElementById('ticketList');
  list.innerHTML = `<div class="empty-state">Cargando tickets…</div>`;

  const registros = await awGetRegistros();
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

  const periquitosTxt = r.periquitos && r.periquitos.monto > 0
    ? `${r.periquitos.descripcion ? escapeHtml(r.periquitos.descripcion) + ' — ' : ''}${awFormatMoney(r.periquitos.monto, r.periquitos.moneda)}`
    : '—';

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
          <label>Monto</label>
          <input type="number" id="pay-monto-${r.id}" value="${r.pago.monto}" step="0.01" min="0">
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
          <div class="ticket-sub">${escapeHtml(r.cliente.telefono)} · ${escapeHtml(r.carro.modelo)} (${escapeHtml(r.carro.color)})</div>
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
        <div class="lbl">Servicio</div><div class="val">${escapeHtml(r.servicio.nombre)}</div>
        <div class="lbl">Bebidas/Snacks</div><div class="val">${bebidasTxt}</div>
        <div class="lbl">Periquitos</div><div class="val">${periquitosTxt}</div>
        <div class="lbl">Método de pago</div><div class="val">${awPaymentLabel(r.pago.metodo)}</div>
        <div class="lbl">Referencia</div><div class="val">${r.pago.referencia ? escapeHtml(r.pago.referencia) : '—'}</div>
        <div class="lbl">Lavador</div><div class="val">${escapeHtml(r.lavador.nombre)} (${r.porcentajeLavador}%)</div>
        <div class="lbl">Propina</div><div class="val">${propinaTxt}</div>
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-grid">
        <div class="lbl">Total</div><div class="val ticket-amount">${awFormatMoney(r.pago.monto, r.pago.moneda)}</div>
        <div class="lbl">Hora</div><div class="val">${awFormatDateTime(r.fecha)}</div>
      </div>
      ${pendienteBlock}
    </article>
  `;
}

async function confirmarPago(id) {
  const metodo = document.getElementById(`pay-metodo-${id}`).value;
  const moneda = document.getElementById(`pay-moneda-${id}`).value;
  const monto = parseFloat(document.getElementById(`pay-monto-${id}`).value) || 0;
  const referencia = document.getElementById(`pay-ref-${id}`).value.trim();
  const conv = awConvertir(monto, moneda, awTasaCache);

  const ok = await awUpdateRegistro(id, {
    estado: 'PAGADO',
    pago: { metodo, moneda, monto, montoBs: conv.bs, montoUsd: conv.usd, referencia, tasaUsada: awTasaCache }
  });
  showToast(ok ? 'Pago confirmado' : 'No se pudo actualizar. Intenta de nuevo.');
  await renderTickets();
}

/* ---------- Imprimir ticket ---------- */
function imprimirTicket(id) {
  const r = awTicketsHoyCache.find(t => t.id === id);
  if (!r) return;
  const bebidasTxt = awBebidasATexto(r.bebidas);
  const propinaTxt = r.propina.monto > 0 ? awFormatMoney(r.propina.monto, r.propina.moneda) : '—';
  const periquitosTxt = r.periquitos && r.periquitos.monto > 0 ? `${r.periquitos.descripcion || 'Periquitos'} — ${awFormatMoney(r.periquitos.monto, r.periquitos.moneda)}` : '—';

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
      <h1>AUTOLAVADO</h1>
      <div class="sub">${awFormatDateTime(r.fecha)}</div>
      <hr>
      <table>
        <tr><td class="lbl">Cliente</td><td class="val">${escapeHtml(r.cliente.nombre)}</td></tr>
        <tr><td class="lbl">Teléfono</td><td class="val">${escapeHtml(r.cliente.telefono)}</td></tr>
        <tr><td class="lbl">Vehículo</td><td class="val">${escapeHtml(r.carro.modelo)} (${escapeHtml(r.carro.color)})</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="lbl">Servicio</td><td class="val">${escapeHtml(r.servicio.nombre)}</td></tr>
        <tr><td class="lbl">Bebidas/Snacks</td><td class="val">${escapeHtml(bebidasTxt)}</td></tr>
        <tr><td class="lbl">Periquitos</td><td class="val">${escapeHtml(periquitosTxt)}</td></tr>
        <tr><td class="lbl">Lavador</td><td class="val">${escapeHtml(r.lavador.nombre)}</td></tr>
        <tr><td class="lbl">Propina</td><td class="val">${propinaTxt}</td></tr>
      </table>
      <hr>
      <table>
        <tr><td class="lbl total">TOTAL</td><td class="val total">${awFormatMoney(r.pago.monto, r.pago.moneda)}</td></tr>
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
