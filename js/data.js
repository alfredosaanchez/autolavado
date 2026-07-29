/* =========================================================
   data.js — capa de datos sobre Supabase
   Todo el sistema (registro.html y admin.html) usa estas
   mismas funciones para leer/escribir la información.
   Todas son asíncronas (usan await).
   ========================================================= */

const AW_BEBIDAS_LEGACY_LABELS = { cerveza: '🍺 Cerveza', refresco: '🥤 Refresco', energizante: '⚡ Energizante' };

function awUid() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
}

/* ---------- Tasa de cambio ---------- */
/* ---------- Perfiles / Roles ---------- */
const AW_ROLES_INFO = {
  'dueño': { label: '👑 Dueño', desc: 'Acceso total: todo lo de Administrador, además de aprobar usuarios nuevos y cambiar el nivel de cualquiera.' },
  'administrador': { label: '🛠️ Administrador', desc: 'Ve y edita todo el panel (Resumen, Registros, Servicios, Bebidas y Snacks, Lavadores, Gastos, Tasa). No puede gestionar usuarios.' },
  'supervisor': { label: '👀 Supervisor', desc: 'Solo puede ver el Resumen y los Registros. No puede editar configuración ni eliminar registros.' },
  'pendiente': { label: '⏳ Pendiente', desc: 'Cuenta creada pero sin aprobar todavía. No ve nada del panel hasta que el Dueño le asigne un nivel.' }
};

async function awSignUp(email, password) {
  const { data, error } = await awSupabase.auth.signUp({ email, password });
  if (error) return { ok: false, error };
  if (data.user) {
    await awSupabase.from('perfiles_admin').insert({ id: data.user.id, email: data.user.email, rol: 'pendiente' });
  }
  await awSupabase.auth.signOut();
  return { ok: true };
}

async function awGetPerfilPropio() {
  const { data: { user } } = await awSupabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await awSupabase.from('perfiles_admin').select('*').eq('id', user.id).maybeSingle();
  if (error) { console.error(error); return null; }
  return data;
}

async function awGetPerfiles() {
  const { data, error } = await awSupabase.from('perfiles_admin').select('*').order('created_at');
  if (error) { console.error(error); return []; }
  return data;
}

async function awUpdateRolUsuario(id, rol) {
  const { error } = await awSupabase.from('perfiles_admin').update({ rol, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
}

async function awGetTasa() {
  const { data, error } = await awSupabase.from('configuracion').select('tasa_usd_bs').eq('id', 1).single();
  if (error) { console.error(error); return 1; }
  return Number(data.tasa_usd_bs) || 1;
}

async function awSetTasa(nuevaTasa) {
  const { error } = await awSupabase.from('configuracion').update({ tasa_usd_bs: nuevaTasa, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) { console.error(error); return false; }
  return true;
}

/* Convierte un monto en 'monedaOrigen' a Bs y a USD, usando la tasa vigente */
function awConvertir(monto, monedaOrigen, tasa) {
  const m = Number(monto) || 0;
  if (monedaOrigen === 'USD') return { bs: m * tasa, usd: m };
  return { bs: m, usd: tasa > 0 ? m / tasa : 0 };
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

/* ---------- Bebidas y Snacks (lista configurable, con emoji) ---------- */
async function awGetBebidasSnacks() {
  const { data, error } = await awSupabase.from('bebidas_snacks').select('*').order('created_at');
  if (error) { console.error(error); return []; }
  return data.map(row => ({ id: row.id, nombre: row.nombre, emoji: row.emoji, precioBs: row.precio_bs, precioUsd: row.precio_usd }));
}

async function awAddBebidaSnackDb(item) {
  const { data, error } = await awSupabase.from('bebidas_snacks').insert({
    nombre: item.nombre, emoji: item.emoji, precio_bs: item.precioBs, precio_usd: item.precioUsd
  }).select().single();
  if (error) { console.error(error); return null; }
  return { id: data.id, nombre: data.nombre, emoji: data.emoji, precioBs: data.precio_bs, precioUsd: data.precio_usd };
}

async function awUpdateBebidaSnackDb(id, cambios) {
  const { error } = await awSupabase.from('bebidas_snacks').update({
    nombre: cambios.nombre, emoji: cambios.emoji, precio_bs: cambios.precioBs, precio_usd: cambios.precioUsd
  }).eq('id', id);
  if (error) console.error(error);
}

async function awDeleteBebidaSnackDb(id) {
  const { error } = await awSupabase.from('bebidas_snacks').delete().eq('id', id);
  if (error) console.error(error);
}

/* Precio en Bs "efectivo": si el artículo ya tiene precio en $, se calcula por tasa.
   Si todavía no le han puesto precio en $ (artículos viejos), usa el Bs guardado. */
function awPrecioBsEfectivo(item, tasa) {
  return item.precioUsd > 0 ? item.precioUsd * tasa : (item.precioBs || 0);
}

const AW_EMOJIS_BEBIDAS_SNACKS = [
  '🥤', '🍺', '⚡', '☕', '🧃', '🍫', '🍬', '🍟', '🥨', '🍪', '🍭', '🍦', '🧊', '🥜', '🍿', '🥐', '🍩', '🌭', '🥪', '🍎'
];

/* Calcula el costo de una selección de bebidas/snacks { itemId: cantidad } contra la lista de precios */
function awCalcularCostoBebidas(seleccion, moneda, items, tasa) {
  return Object.entries(seleccion || {}).reduce((sum, [itemId, qty]) => {
    const item = (items || []).find(i => i.id === itemId);
    if (!item) return sum;
    const precio = moneda === 'USD' ? (item.precioUsd || 0) : awPrecioBsEfectivo(item, tasa || 1);
    return sum + (Number(qty) || 0) * precio;
  }, 0);
}

function awContarBebidas(bebidas) {
  if (Array.isArray(bebidas)) return bebidas.reduce((s, b) => s + (Number(b.cantidad) || 0), 0);
  if (bebidas && typeof bebidas === 'object') return Object.values(bebidas).reduce((s, v) => s + (Number(v) || 0), 0);
  return 0;
}

/* Texto legible de bebidas consumidas. Soporta el formato nuevo (array de líneas)
   y el formato viejo (objeto {cerveza,refresco,energizante}) para tickets antiguos. */
function awBebidasATexto(bebidas) {
  if (Array.isArray(bebidas)) {
    return bebidas.filter(b => b.cantidad > 0).map(b => `${b.cantidad}× ${b.emoji || ''} ${b.nombre}`).join(', ') || 'Ninguna';
  }
  if (bebidas && typeof bebidas === 'object') {
    const legibles = { cerveza: '🍺 Cerveza', refresco: '🥤 Refresco', energizante: '⚡ Energizante' };
    return Object.entries(bebidas).filter(([, v]) => v > 0).map(([k, v]) => `${v}× ${legibles[k] || k}`).join(', ') || 'Ninguna';
  }
  return 'Ninguna';
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

/* ---------- Perfiles / Usuarios (jerarquía) ---------- */
async function awGetMiPerfil() {
  const { data: { user } } = await awSupabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await awSupabase.from('perfiles').select('*').eq('id', user.id).single();
  if (error) { console.error(error); return null; }
  return data;
}

async function awGetPerfiles() {
  const { data, error } = await awSupabase.from('perfiles').select('*').order('created_at');
  if (error) { console.error(error); return []; }
  return data;
}

async function awActualizarPerfil(id, cambios) {
  const { error } = await awSupabase.from('perfiles').update(cambios).eq('id', id);
  if (error) { console.error(error); return false; }
  return true;
}

const AW_ROL_LABELS = { dueno: 'Dueño', gerente: 'Gerente', cajero: 'Cajero' };
const AW_ESTADO_PERFIL_LABELS = { pendiente: 'Pendiente', activo: 'Activo', rechazado: 'Rechazado' };

/* ---------- Gastos del negocio ---------- */
async function awGetGastos() {
  const { data, error } = await awSupabase.from('gastos').select('*').order('fecha', { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(row => ({ id: row.id, fecha: row.fecha, descripcion: row.descripcion, categoria: row.categoria, monto: row.monto, moneda: row.moneda }));
}

async function awAddGastoDb(gasto) {
  const { error } = await awSupabase.from('gastos').insert({
    fecha: gasto.fecha, descripcion: gasto.descripcion, categoria: gasto.categoria, monto: gasto.monto, moneda: gasto.moneda
  });
  if (error) { console.error(error); return false; }
  return true;
}

async function awDeleteGastoDb(id) {
  const { error } = await awSupabase.from('gastos').delete().eq('id', id);
  if (error) console.error(error);
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
