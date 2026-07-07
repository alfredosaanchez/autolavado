/* =========================================================
   data.js — capa de datos sobre localStorage
   Todo el sistema (registro.html y admin.html) usa estas
   mismas funciones para leer/escribir la información.
   ========================================================= */

const AW_KEYS = {
  SERVICIOS: 'aw_servicios',
  LAVADORES: 'aw_lavadores',
  REGISTROS: 'aw_registros'
};

function awUid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function awRead(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Error leyendo', key, e);
    return null;
  }
}

function awWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- Semilla inicial ---------- */
function awSeedIfEmpty() {
  if (!awRead(AW_KEYS.SERVICIOS)) {
    awWrite(AW_KEYS.SERVICIOS, [
      { id: awUid(), nombre: 'Serv1', descripcion: 'Lavado básico', precioBs: 0, precioUsd: 0 },
      { id: awUid(), nombre: 'Serv2', descripcion: 'Lavado + aspirado', precioBs: 0, precioUsd: 0 },
      { id: awUid(), nombre: 'Serv3', descripcion: 'Lavado premium', precioBs: 0, precioUsd: 0 }
    ]);
  }
  if (!awRead(AW_KEYS.LAVADORES)) {
    awWrite(AW_KEYS.LAVADORES, [
      { id: awUid(), nombre: 'Lavador 1' },
      { id: awUid(), nombre: 'Lavador 2' }
    ]);
  }
  if (!awRead(AW_KEYS.REGISTROS)) {
    awWrite(AW_KEYS.REGISTROS, []);
  }
}

/* ---------- Servicios ---------- */
function awGetServicios() { return awRead(AW_KEYS.SERVICIOS) || []; }
function awSaveServicios(list) { awWrite(AW_KEYS.SERVICIOS, list); }

/* ---------- Lavadores ---------- */
function awGetLavadores() { return awRead(AW_KEYS.LAVADORES) || []; }
function awSaveLavadores(list) { awWrite(AW_KEYS.LAVADORES, list); }

/* ---------- Registros ---------- */
function awGetRegistros() { return awRead(AW_KEYS.REGISTROS) || []; }
function awSaveRegistros(list) { awWrite(AW_KEYS.REGISTROS, list); }

function awAddRegistro(registro) {
  const list = awGetRegistros();
  list.unshift(registro);
  awSaveRegistros(list);
  return registro;
}

function awUpdateRegistro(id, changes) {
  const list = awGetRegistros();
  const idx = list.findIndex(r => r.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...changes };
  awSaveRegistros(list);
  return list[idx];
}

function awDeleteRegistro(id) {
  const list = awGetRegistros().filter(r => r.id !== id);
  awSaveRegistros(list);
}

/* ---------- Utilidades de formato ---------- */
function awFormatMoney(amount, moneda) {
  const n = Number(amount) || 0;
  const symbol = moneda === 'USD' ? '$' : 'Bs';
  return `${symbol} ${n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function awFormatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function awIsToday(iso) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
         d.getMonth() === now.getMonth() &&
         d.getDate() === now.getDate();
}

function awPaymentLabel(metodo) {
  return { punto: 'Punto de venta', movil: 'Pago móvil', pendiente: 'Pendiente' }[metodo] || metodo;
}

document.addEventListener('DOMContentLoaded', awSeedIfEmpty);
