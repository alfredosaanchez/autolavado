/* =========================================================
   registro.js — lógica de la página principal de registro
   ========================================================= */

let awDrinkCounts = { cerveza: 0, refresco: 0, energizante: 0 };

document.addEventListener('DOMContentLoaded', () => {
  awSeedIfEmpty();
  poblarServicios();
  poblarLavadores();
  bindDrinkSteppers();
  bindMetodoPago();
  bindServicioChange();
  document.getElementById('form-registro').addEventListener('submit', onSubmitRegistro);
  renderTickets();
});

/* ---------- Poblar selects desde configuración ---------- */
function poblarServicios() {
  const sel = document.getElementById('servicioSelect');
  const servicios = awGetServicios();
  sel.innerHTML = servicios.map(s =>
    `<option value="${s.id}">${escapeHtml(s.nombre)}${s.descripcion ? ' — ' + escapeHtml(s.descripcion) : ''}</option>`
  ).join('') || '<option value="">No hay servicios configurados</option>';
  actualizarHintPrecio();
}

function poblarLavadores() {
  const sel = document.getElementById('lavadorSelect');
  const lavadores = awGetLavadores();
  sel.innerHTML = lavadores.map(l =>
    `<option value="${l.id}">${escapeHtml(l.nombre)}</option>`
  ).join('') || '<option value="">No hay lavadores configurados</option>';
}

function bindServicioChange() {
  document.getElementById('servicioSelect').addEventListener('change', actualizarHintPrecio);
  document.getElementById('monedaPago').addEventListener('change', actualizarHintPrecio);
}

function actualizarHintPrecio() {
  const servicios = awGetServicios();
  const id = document.getElementById('servicioSelect').value;
  const moneda = document.getElementById('monedaPago').value;
  const s = servicios.find(x => x.id === id);
  const hint = document.getElementById('servicioPrecioHint');
  if (!s) { hint.textContent = ''; return; }
  const precio = moneda === 'USD' ? s.precioUsd : s.precioBs;
  hint.textContent = `Precio referencial: ${awFormatMoney(precio, moneda)} — puedes ajustar el monto total abajo.`;
  const montoInput = document.getElementById('montoTotal');
  if (!montoInput.dataset.touched) {
    montoInput.value = precio || '';
  }
}

/* ---------- Contador de bebidas ---------- */
function bindDrinkSteppers() {
  document.querySelectorAll('.stepper button').forEach(btn => {
    btn.addEventListener('click', () => {
      const drink = btn.dataset.drink;
      const op = btn.dataset.op;
      let val = awDrinkCounts[drink];
      val = op === '+' ? val + 1 : Math.max(0, val - 1);
      awDrinkCounts[drink] = val;
      document.getElementById(`qty-${drink}`).textContent = val;
    });
  });
  document.getElementById('montoTotal').addEventListener('input', (e) => {
    e.target.dataset.touched = '1';
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
  if (metodo === 'pendiente') {
    wrap.style.opacity = '0.5';
    refInput.removeAttribute('required');
  } else {
    wrap.style.opacity = '1';
    refInput.setAttribute('required', 'required');
  }
}

/* ---------- Envío del formulario ---------- */
function onSubmitRegistro(e) {
  e.preventDefault();

  const metodo = document.querySelector('input[name="metodoPago"]:checked').value;
  const servicios = awGetServicios();
  const lavadores = awGetLavadores();
  const servicioId = document.getElementById('servicioSelect').value;
  const lavadorId = document.getElementById('lavadorSelect').value;
  const servicio = servicios.find(s => s.id === servicioId);
  const lavador = lavadores.find(l => l.id === lavadorId);

  const registro = {
    id: awUid(),
    fecha: new Date().toISOString(),
    cliente: {
      nombre: document.getElementById('clienteNombre').value.trim(),
      telefono: document.getElementById('clienteTelefono').value.trim()
    },
    carro: {
      modelo: document.getElementById('carroModelo').value.trim(),
      color: document.getElementById('carroColor').value.trim()
    },
    servicio: { id: servicioId, nombre: servicio ? servicio.nombre : '—' },
    bebidas: { ...awDrinkCounts },
    pago: {
      metodo: metodo,
      moneda: document.getElementById('monedaPago').value,
      monto: parseFloat(document.getElementById('montoTotal').value) || 0,
      referencia: document.getElementById('referenciaPago').value.trim()
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

  awAddRegistro(registro);
  showToast(metodo === 'pendiente' ? 'Registrado como PENDIENTE' : 'Lavado registrado correctamente');
  resetForm();
  renderTickets();
}

function resetForm() {
  document.getElementById('form-registro').reset();
  awDrinkCounts = { cerveza: 0, refresco: 0, energizante: 0 };
  ['cerveza', 'refresco', 'energizante'].forEach(d => {
    document.getElementById(`qty-${d}`).textContent = '0';
  });
  document.getElementById('montoTotal').dataset.touched = '';
  updateReferenciaVisibility();
  actualizarHintPrecio();
}

/* ---------- Render de tickets del día ---------- */
function renderTickets() {
  const list = document.getElementById('ticketList');
  const all = awGetRegistros().filter(r => awIsToday(r.fecha));
  document.getElementById('ticketsCount').textContent = `${all.length} registro${all.length === 1 ? '' : 's'} hoy`;

  if (all.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">🧽</div>Todavía no hay registros hoy.<br>El primer ticket del día aparecerá aquí.</div>`;
    return;
  }

  list.innerHTML = all.map(r => renderTicket(r)).join('');

  list.querySelectorAll('[data-toggle-pay]').forEach(btn => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(`pay-form-${btn.dataset.togglePay}`);
      form.classList.toggle('open');
    });
  });

  list.querySelectorAll('[data-confirm-pay]').forEach(btn => {
    btn.addEventListener('click', () => confirmarPago(btn.dataset.confirmPay));
  });
}

function renderTicket(r) {
  const bebidasTxt = Object.entries(r.bebidas)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v}× ${capitalize(k)}`)
    .join(', ') || 'Ninguna';

  const propinaTxt = r.propina.monto > 0
    ? awFormatMoney(r.propina.monto, r.propina.moneda) + (r.propina.referencia ? ` (Ref: ${escapeHtml(r.propina.referencia)})` : '')
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
        <span class="stamp ${r.estado.toLowerCase()}">${r.estado}</span>
      </div>
      <div class="ticket-divider"></div>
      <div class="ticket-grid">
        <div class="lbl">Servicio</div><div class="val">${escapeHtml(r.servicio.nombre)}</div>
        <div class="lbl">Bebidas</div><div class="val">${bebidasTxt}</div>
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

function confirmarPago(id) {
  const metodo = document.getElementById(`pay-metodo-${id}`).value;
  const moneda = document.getElementById(`pay-moneda-${id}`).value;
  const monto = parseFloat(document.getElementById(`pay-monto-${id}`).value) || 0;
  const referencia = document.getElementById(`pay-ref-${id}`).value.trim();

  awUpdateRegistro(id, {
    estado: 'PAGADO',
    pago: { metodo, moneda, monto, referencia }
  });
  showToast('Pago confirmado');
  renderTickets();
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
