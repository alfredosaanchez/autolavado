/* =========================================================
   data.js — capa de datos sobre Supabase
   Todo el sistema (registro.html y admin.html) usa estas
   mismas funciones para leer/escribir la información.
   Todas son asíncronas (usan await).
   ========================================================= */

const AW_BEBIDA_LABELS = { cerveza: 'Cerveza', refresco: 'Refresco', energizante: 'Energizante' };

function awUid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

/* ---------- Servicios ---------- */
async function awGetServicios() {
  const { data, error } = await awSupabase.from('servicios').select('*').order('created_at');
  if (error) { console.error(error); return []; }
  return data.map(awMapServicioFromDb);
}

function awMapServicioFromDb(row) {
  return { id: row.id, nombre: row.nombre, descripcion: row.descripcion, precioBs: row.precio_bs, precioUsd: row.precio_usd };
}

async function awAddServicioDb(servicio) {
  const { error } = await awSupabase.from('servicios').insert({
    nombre: servicio.nombre, descripcion: servicio.descripcion, precio_bs: servicio.precioBs, precio_usd: servicio.precioUsd
  });
  if (error) console.error(error);
}

async function awUpdateServicioDb(id, cambios) {
  const { error } = await awSupabase.from('servicios').update({
    nombre: cambios.nombre, descripcion: cambios.descripcion, precio_bs: cambios.precioBs, precio_usd: cambios.precioUsd
  }).eq('id', id);
  if (error) console.error(error);
}

async function awDeleteServicioDb(id) {
  const { error } = await awSupabase.from('servicios').delete().eq('id', id);
  if (error) console.error(error);
}

/* ---------- Lavadores ---------- */
async function awGetLavadores() {
  const { data, error } = await awSupabase.from('lavadores').select('*').order('created_at');
  if (error) { console.error(error); return []; }
  return data.map(row => ({ id: row.id, nombre: row.nombre }));
}

async function awAddLavadorDb(nombre) {
  const { error } = await awSupabase.from('lavadores').insert({ nombre });
  if (error) console.error(error);
}

async function awUpdateLavadorDb(id, nombre) {
  const { error } = await awSupabase.from('lavadores').update({ nombre }).eq('id', id);
  if (error) console.error(error);
}

async function awDeleteLavadorDb(id) {
  const { error } = await awSupabase.from('lavadores').delete().eq('id', id);
  if (error) console.error(error);
}

/* ---------- Bebidas (precios) ---------- */
async function awGetBebidasPrecios() {
  const { data, error } = await awSupabase.from('bebidas_precios').select('*');
  if (error) { console.error(error); return {}; }
  const obj = {};
  data.forEach(row => { obj[row.tipo] = { precioBs: row.precio_bs, precioUsd: row.precio_usd }; });
  return obj;
}

async function awSaveBebidaPrecioDb(tipo, precioBs, precioUsd) {
  const { error } = await awSupabase.from('bebidas_precios').upsert({ tipo, precio_bs: precioBs, precio_usd: precioUsd });
  if (error) console.error(error);
}

function awCalcularCostoBebidas(bebidasCounts, moneda, precios) {
  const campo = moneda === 'USD' ? 'precioUsd' : 'precioBs';
  return Object.entries(bebidasCounts || {}).reduce((sum, [tipo, qty]) => {
    const precio = precios && precios[tipo] ? (precios[tipo][campo] || 0) : 0;
    return sum + (Number(qty) || 0) * precio;
  }, 0);
}

/* ---------- Registros ---------- */
async function awGetRegistros() {
  const { data, error } = await awSupabase.from('registros').select('*').order('fecha', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(awMapRegistroFromDb);
}

function awMapRegistroFromDb(row) {
  return {
    id: row.id,
    fecha: row.fecha,
    estado: row.estado,
    cliente: row.cliente,
    carro: row.carro,
    servicio: row.servicio,
    bebidas: row.bebidas,
    periquitos: row.periquitos || { descripcion: '', monto: 0, moneda: 'Bs' },
    pago: row.pago,
    lavador: row.lavador,
    porcentajeLavador: row.porcentaje_lavador,
    propina: row.propina
  };
}

async function awAddRegistro(registro) {
  const { error } = await awSupabase.from('registros').insert({
    id: registro.id,
    fecha: registro.fecha,
    estado: registro.estado,
    cliente: registro.cliente,
    carro: registro.carro,
    servicio: registro.servicio,
    bebidas: registro.bebidas,
    periquitos: registro.periquitos,
    pago: registro.pago,
    lavador: registro.lavador,
    porcentaje_lavador: registro.porcentajeLavador,
    propina: registro.propina
  });
  if (error) { console.error(error); return false; }
  return true;
}

async function awUpdateRegistro(id, cambios) {
  const payload = {};
  if (cambios.estado !== undefined) payload.estado = cambios.estado;
  if (cambios.pago !== undefined) payload.pago = cambios.pago;
  const { error } = await awSupabase.from('registros').update(payload).eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
}

async function awDeleteRegistro(id) {
  const { error } = await awSupabase.from('registros').delete().eq('id', id);
  if (error) console.error(error);
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
  return { efectivo: 'Efectivo', punto: 'Punto de venta', movil: 'Pago móvil', pendiente: 'Pendiente' }[metodo] || metodo;
}

/* ---------- WhatsApp ---------- */
function awNormalizarTelefonoVE(telefono) {
  let digitos = (telefono || '').replace(/\D/g, '');
  if (digitos.startsWith('58')) return digitos;
  if (digitos.startsWith('0')) return '58' + digitos.slice(1);
  return '58' + digitos;
}

function awWhatsAppLink(telefono, nombre, carroModelo) {
  const numero = awNormalizarTelefonoVE(telefono);
  const mensaje = `Hola, buenas Sr(a) ${nombre}, un gusto saludarle desde el AUTOLAVADO, su vehículo ${carroModelo} ya está listo para que venga a retirarlo.`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
