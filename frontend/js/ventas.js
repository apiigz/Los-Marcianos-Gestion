// ==========================================
// ESTADO GLOBAL DE LA TERMINAL
// ==========================================
let sesionActual = null;
let turnoActivoGlobal = null;
let terminalActual = null;   // { id, nombre, caja_fisica_id, sucursal_id, sucursal_nombre, caja_nombre }
let cajaIdTerminal = null;
let carrito = [];
let debounceTimeout = null;
let modoDevolucionActivo = false;
let latidoTimer = null;

let config = { debito: 10, credito: 10, maximo: 15, puede_cambiar_recargo: false };
const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const INTERVALO_LATIDO_MS = 60 * 1000;

// Elementos DOM
const userDisplay = document.getElementById('user-display');
const userAvatar = document.getElementById('user-avatar');
const terminalBadge = document.getElementById('terminal-badge');
const badgeModoPOS = document.getElementById('badge-modo-pos');
const btnToggleModo = document.getElementById('btn-toggle-modo');
const btnToggleModoLabel = document.getElementById('btn-toggle-modo-label');

const searchInput = document.getElementById('product-search-input');
const suggestionsList = document.getElementById('search-suggestions');
const cartRows = document.getElementById('cart-rows');
const labelItemsCount = document.getElementById('label-items-count');
const cellSubtotal = document.getElementById('cell-subtotal');
const labelTotalPagar = document.getElementById('label-total-pagar');
const labelRecargo = document.getElementById('label-recargo');
const labelTotalUnidades = document.getElementById('label-total-unidades');
const labelOperacionTotal = document.getElementById('label-operacion-total');

const btnFacturar = document.getElementById('btn-facturar');
const btnFacturarText = document.getElementById('btn-facturar-text');
const btnCancelar = document.getElementById('btn-cancelar');
const btnFiado = document.getElementById('btn-fiado');

// Inputs de Pago
const payInputs = {
  efectivo: document.getElementById('pay-efectivo'),
  debito: document.getElementById('pay-debito'),
  credito: document.getElementById('pay-credito'),
  qr: document.getElementById('pay-qr')
};

const statusBanner = document.getElementById('status-banner');
const statusMensaje = document.getElementById('status-mensaje');
const displayVuelto = document.getElementById('display-vuelto');

// Modales
const modalApertura = document.getElementById('modal-apertura-turno');
const formApertura = document.getElementById('form-apertura-turno');
const inputAperturaMonto = document.getElementById('input-apertura-monto');

const modalCierrePOS = document.getElementById('modal-cierre-turno-pos');
const inputMontoRealPOS = document.getElementById('input-pos-monto-real');
const btnAbrirCierre = document.getElementById('btn-cierre-turno-pos');
const btnCancelarCierre = document.getElementById('btn-pos-close-modal-cancel');
const btnCierreDefinitivo = document.getElementById('btn-pos-cierre-definitivo');
const btnCierreRapido = document.getElementById('btn-pos-cierre-rapido');

const btnVerHistorial = document.getElementById('btn-ver-historial');
const modalHistorial = document.getElementById('modal-historial');
const btnCerrarHistorial = document.getElementById('btn-cerrar-historial');
const btnVolverVentas = document.getElementById('btn-volver-ventas');
const historialTbody = document.getElementById('historial-tbody');
const historialSubtitulo = document.getElementById('historial-subtitulo');

const modalFiado = document.getElementById('modal-fiado');
const btnCancelarFiado = document.getElementById('btn-cancelar-fiado');
const btnConfirmarFiado = document.getElementById('btn-confirmar-fiado');
const selectEmpleadoFiado = document.getElementById('select-empleado-fiado');
const fiadoTotalDisplay = document.getElementById('fiado-total-display');

const modalTerminal = document.getElementById('modal-terminal');
const selectTerminal = document.getElementById('select-terminal');
const btnConfirmarTerminal = document.getElementById('btn-confirmar-terminal');
const btnCambiarTerminal = document.getElementById('btn-cambiar-terminal');

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  await iniciarTerminal();
  configurarEventosUI();
});

async function iniciarTerminal() {
  try {
    const user = await Auth.init('pos.acceder');
    if (!user) return;
    sesionActual = user;

    if (userDisplay) userDisplay.textContent = `${user.nombre} ${user.apellido || ''}`;
    if (userAvatar) {
      const iniciales = `${user.nombre?.[0] || ''}${user.apellido?.[0] || ''}`.toUpperCase();
      userAvatar.textContent = iniciales || 'US';
    }

    await resolverTerminal();
    await cargarConfigPOS();
    await verificarTurnoAlIniciar();
  } catch (error) {
    console.error('Error al inicializar terminal:', error);
    alert(error.message || 'No se pudo iniciar la terminal. Recargá la página.');
  }
}

// ----- Terminal ligada a la PC -----
async function resolverTerminal() {
  const res = await fetch('/api/v1/terminal', { credentials: 'include' });
  if (!res.ok) throw new Error('No se pudo obtener la lista de terminales.');
  const lista = await res.json();
  if (!lista.length) throw new Error('No hay terminales configuradas. Avisale al administrador.');

  const guardado = Number(localStorage.getItem('pos_terminal_id'));
  terminalActual = lista.find(t => t.id === guardado) || null;

  if (!terminalActual) {
    terminalActual = await pedirTerminal(lista);
    localStorage.setItem('pos_terminal_id', String(terminalActual.id));
  }
  localStorage.removeItem('pos_caja_id');   // clave vieja, ya no se usa
  cajaIdTerminal = terminalActual.caja_fisica_id;
  pintarBadgeTerminal();
}

function pedirTerminal(lista) {
  return new Promise((resolve) => {
    selectTerminal.innerHTML = lista.map(t =>
      `<option value="${t.id}">${escapeHtml(t.sucursal_nombre)} · ${escapeHtml(t.caja_nombre)} · ${escapeHtml(t.nombre)}</option>`
    ).join('');
    modalTerminal.classList.remove('hidden');
    btnConfirmarTerminal.onclick = () => {
      const t = lista.find(x => x.id === Number(selectTerminal.value));
      if (!t) return;
      modalTerminal.classList.add('hidden');
      resolve(t);
    };
  });
}

function pintarBadgeTerminal() {
  if (!terminalBadge || !terminalActual) return;
  terminalBadge.innerHTML =
    `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>` +
    `${escapeHtml(terminalActual.sucursal_nombre)} · ${escapeHtml(terminalActual.nombre)}`;
}

btnCambiarTerminal?.addEventListener('click', async () => {
  if (!confirm('¿Cambiar la terminal asignada a esta PC? Vas a tener que elegirla de nuevo.')) return;
  try { await fetch('/api/v1/turno_caja/salir', { method: 'POST', credentials: 'include' }); } catch {}
  localStorage.removeItem('pos_terminal_id');
  location.reload();
});

// ----- Presencia (latido) -----
async function enviarPresencia() {
  if (!turnoActivoGlobal || !terminalActual) return true;
  try {
    const res = await fetch(`/api/v1/turno_caja/${turnoActivoGlobal.id}/presencia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ terminal_id: terminalActual.id })
    });
    if (res.ok) return true;
    const err = await res.json().catch(() => ({}));
    await manejarErrorPresencia(err);
    return false;
  } catch {
    return true;   // sin internet: no molestar al cajero, el próximo latido reintenta
  }
}

async function manejarErrorPresencia(err) {
  detenerLatido();

  if (err.codigo === 'TURNO_NO_ABIERTO') {
    alert('El turno fue cerrado (por otro cajero o por un administrador). Se cancela la venta en curso.');
    turnoActivoGlobal = null;
    carrito = [];
    renderizarCarrito();
    await verificarTurnoAlIniciar();
    return;
  }

  if (err.codigo === 'TERMINAL_EN_USO' || err.codigo === 'TERMINAL_INVALIDA') {
    alert(`${err.error || 'Terminal no disponible.'}\nElegí otra terminal.`);
    localStorage.removeItem('pos_terminal_id');
    location.reload();
    return;
  }

  alert(err.error || 'No se pudo registrar tu presencia en el turno.');
}

async function iniciarPresencia() {
  detenerLatido();
  const ok = await enviarPresencia();
  if (ok) latidoTimer = setInterval(enviarPresencia, INTERVALO_LATIDO_MS);
  return ok;
}

function detenerLatido() {
  if (latidoTimer) clearInterval(latidoTimer);
  latidoTimer = null;
}

// ----- Turno -----
async function verificarTurnoAlIniciar() {
  detenerLatido();
  try {
    const res = await fetch(`/api/v1/turno_caja/activo?terminal_id=${terminalActual.id}`, { credentials: 'include' });
    const turno = res.ok ? await res.json() : null;

    if (turno?.estado === 'EN_CIERRE') {
      alert('El turno anterior de esta caja está pendiente de arqueo. Un administrador debe auditarlo antes de abrir uno nuevo.');
      await Auth.logout();
      return;
    }

    if (turno?.id && turno.estado === 'ABIERTO') {
      turnoActivoGlobal = turno;
      modalApertura?.classList.add('hidden');
      if (await iniciarPresencia()) searchInput?.focus();
    } else {
      turnoActivoGlobal = null;
      modalApertura?.classList.remove('hidden');
      setTimeout(() => inputAperturaMonto?.focus(), 100);
    }
  } catch (err) {
    console.error('Error al verificar turno:', err);
    modalApertura?.classList.remove('hidden');
  }
}

// ==========================================
// 2. CICLO DE TURNO (APERTURA Y CIERRE)
// ==========================================
formApertura?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = parseFloat(inputAperturaMonto.value);

  if (isNaN(monto) || monto < 0) {
    alert('Ingrese un fondo inicial válido.');
    inputAperturaMonto.focus();
    return;
  }

  try {
    const res = await fetch('/api/v1/turno_caja/abrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ terminal_id: terminalActual.id, monto_inicial_efectivo: monto })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo abrir el turno.');
    }

    turnoActivoGlobal = await res.json();
    modalApertura.classList.add('hidden');
    await iniciarPresencia();
    searchInput?.focus();
    alert(`Turno #${turnoActivoGlobal.id} (${turnoActivoGlobal.nombre_turno}) abierto correctamente.`);
  } catch (err) {
    alert(err.message);
  }
});

btnAbrirCierre?.addEventListener('click', () => {
  if (!turnoActivoGlobal) {
    alert('No hay turno activo para cerrar.');
    return;
  }
  inputMontoRealPOS.value = '';
  modalCierrePOS.classList.remove('hidden');
  inputMontoRealPOS.focus();
});

btnCancelarCierre?.addEventListener('click', () => {
  modalCierrePOS.classList.add('hidden');
});

btnCierreDefinitivo?.addEventListener('click', async () => {
  const monto = parseFloat(inputMontoRealPOS.value);
  if (isNaN(monto) || monto < 0) {
    alert('Debe ingresar el conteo de efectivo en caja.');
    inputMontoRealPOS.focus();
    return;
  }
  if (!confirm(`¿Confirma el cierre de caja con un arqueo de $${monto.toFixed(2)}?`)) return;
  await procesarCierre({ tipo: 'DEFINITIVO', monto_real: monto });
});

btnCierreRapido?.addEventListener('click', async () => {
  if (!confirm('¿Confirma el CIERRE RÁPIDO? El arqueo físico quedará pendiente de auditar.')) return;
  await procesarCierre({ tipo: 'RAPIDO' });
});

async function procesarCierre(payload) {
  try {
    const res = await fetch(`/api/v1/turno_caja/${turnoActivoGlobal.id}/cierre`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al cerrar el turno.');
    }

    detenerLatido();
    alert('Turno cerrado exitosamente. Si había otro cajero en la caja, su pantalla le va a pedir abrir un turno nuevo.');
    await Auth.logout();
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// 3. MODO DEVOLUCIÓN (F2)
// ==========================================
function toggleModoDevolucion() {
  modoDevolucionActivo = !modoDevolucionActivo;

  if (modoDevolucionActivo) {
    badgeModoPOS.textContent = 'DEVOLUCIÓN (F2)';
    badgeModoPOS.className = 'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-400/30';
    btnToggleModo.className = 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400';
    btnToggleModoLabel.textContent = 'VOLVER A VENTA';
    labelOperacionTotal.textContent = 'TOTAL A REINTEGRAR';
    labelOperacionTotal.className = 'text-xs font-bold uppercase tracking-widest text-amber-400/90';
    btnFacturarText.textContent = 'Reintegrar Efectivo';
    if (btnFiado) btnFiado.disabled = true;
  } else {
    badgeModoPOS.textContent = 'VENTA';
    badgeModoPOS.className = 'inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
    btnToggleModo.className = 'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400';
    btnToggleModoLabel.textContent = 'MODO DEVOLUCIÓN';
    labelOperacionTotal.textContent = 'TOTAL A PAGAR';
    labelOperacionTotal.className = 'text-xs font-bold uppercase tracking-widest text-emerald-400/90';
    btnFacturarText.textContent = 'Facturar';
    if (btnFiado) btnFiado.disabled = carrito.length === 0;
  }

  searchInput?.focus();
  recalcularTotales();
}

btnToggleModo?.addEventListener('click', toggleModoDevolucion);

// ==========================================
// 4. GESTIÓN DEL CARRITO
// ==========================================
function agregarAlCarrito(producto) {
  const unidad = String(producto.unidad_medida || 'UNIDAD').toUpperCase().trim();
  const esPesable = (unidad === 'KILO' || unidad === 'KG');
  const multiplicador = modoDevolucionActivo ? -1 : 1;

  const itemExistente = carrito.find(p => p.id === producto.id);

  if (itemExistente) {
    // Si es pesable, sumar 100g (0.100); si es unidad, sumar 1
    const paso = (esPesable ? 0.100 : 1) * multiplicador;
    itemExistente.cantidad = Number((Number(itemExistente.cantidad) + paso).toFixed(3));
  } else {
    carrito.push({
      id: producto.id,
      codigo_barra: producto.codigo_barra || '',
      descripcion: producto.descripcion,
      precio_unitario: Number(producto.precio_minorista || producto.precio),
      unidad_medida: esPesable ? 'KILO' : 'UNIDAD',
      cantidad: (esPesable ? 1.000 : 1) * multiplicador,
      es_combo: Boolean(producto.es_combo)
    });
  }
  renderizarCarrito();
}

function renderizarCarrito() {
  cartRows.innerHTML = '';

  carrito.forEach((item, index) => {
    const unidad = String(item.unidad_medida || '').toUpperCase();
    const esPesable = (unidad === 'KILO' || unidad === 'KG');
    const totalItem = Number(item.cantidad) * Number(item.precio_unitario);
    const esNegativo = item.cantidad < 0;

    // Formateo visual de cantidad: 3 decimales para pesables (ej: 0.250 o 1.000)
    const cantidadMostrada = esPesable 
      ? Number(item.cantidad).toFixed(3) 
      : Math.round(item.cantidad);

    const stepValue = esPesable ? "0.050" : "1";

    const tr = document.createElement('tr');
    tr.className = `hover:bg-slate-50/80 transition-colors group ${esNegativo ? 'bg-red-50/50' : ''}`;

    tr.innerHTML = `
      <td class="py-3.5 px-5">
        <div class="font-medium text-slate-900">${escapeHtml(item.descripcion)}</div>
        <div class="flex items-center gap-2 mt-0.5">
          ${item.codigo_barra ? `<span class="text-xs text-slate-400 font-mono">${escapeHtml(item.codigo_barra)}</span>` : ''}
          ${item.es_combo ? `<span class="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">[COMBO]</span>` : ''}
          ${esPesable ? `<span class="text-[10px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">VENTA AL PESO ($/KG)</span>` : ''}
          ${esNegativo ? `<span class="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded border border-red-200">[DEVOLUCIÓN]</span>` : ''}
        </div>
      </td>

      <td class="py-3.5 px-4 text-center">
        <div class="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5 shadow-2xs">
          <button type="button" onclick="modificarCantidad(${index}, -1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded font-semibold text-sm transition-colors">−</button>
          
          <input 
            type="number" 
            value="${cantidadMostrada}" 
            step="${stepValue}"
            min="${esPesable ? '0.001' : '1'}"
            onclick="this.select()"
            onchange="cambiarCantidadManual(${index}, this.value)"
            class="bg-transparent text-center font-semibold text-slate-800 border-none p-0 focus:ring-0 text-sm ${esPesable ? 'w-16' : 'w-10'} ${esNegativo ? 'text-red-600' : ''}"
          />

          <button type="button" onclick="modificarCantidad(${index}, 1)" class="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-white hover:text-slate-900 rounded font-semibold text-sm transition-colors">+</button>
        </div>
        ${esPesable ? `<span class="text-[11px] font-bold text-slate-500 ml-1 font-mono">kg</span>` : `<span class="text-[11px] text-slate-400 ml-1 font-mono">u.</span>`}
      </td>

      <td class="py-3.5 px-4 text-right font-mono text-slate-600">
        $ ${Number(item.precio_unitario).toFixed(2)}
        ${esPesable ? `<span class="text-[10px] text-slate-400 block font-sans">x kg</span>` : ''}
      </td>

      <td class="py-3.5 px-5 text-right font-mono font-semibold ${esNegativo ? 'text-red-600' : 'text-slate-900'}">
        $ ${totalItem.toFixed(2)}
      </td>

      <td class="py-3.5 px-3 text-center">
        <button type="button" onclick="eliminarFila(${index})" title="Eliminar ítem" class="text-slate-300 hover:text-red-600 p-1 rounded-md transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
          </svg>
        </button>
      </td>
    `;
    cartRows.appendChild(tr);
  });

  const cantArticulos = carrito.length;
  labelItemsCount.textContent = `${cantArticulos} renglones registrados`;
  
  // Total unidades en el resumen lateral
  const unidadesTexto = carrito.map(i => {
    const esP = (i.unidad_medida || '').toUpperCase().includes('K');
    return `${Math.abs(Number(i.cantidad))}${esP ? 'kg' : 'u'}`;
  }).join(' + ');

  labelTotalUnidades.textContent = unidadesTexto || '0 unidades';

  recalcularTotales();
}

// ==========================================
// RECARGOS CONFIGURABLES
// ==========================================
async function cargarConfigPOS() {
  const res = await fetch('/api/v1/configuracion/pos', { credentials: 'include' });
  if (!res.ok) throw new Error('No se pudo cargar la configuración de recargos.');
  config = await res.json();

  const iD = document.getElementById('pct-debito');
  const iC = document.getElementById('pct-credito');
  if (iD) { iD.value = config.debito;  iD.max = config.maximo; }
  if (iC) { iC.value = config.credito; iC.max = config.maximo; }
}

// Porcentaje vigente para 'debito' | 'credito'
function pctRecargo(medio) {
  const def = config[medio];
  if (!config.puede_cambiar_recargo) return def;
  const el = document.getElementById(`pct-${medio}`);
  const v = parseFloat(el?.value);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), config.maximo) : def;
}

function actualizarEtiquetasRecargo(pD, pC) {
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  set('lbl-pct-debito', pD);
  set('lbl-pct-credito', pC);
  set('txt-recargos', `Recargo débito ${pD}% · crédito ${pC}%`);
}

// ==========================================
// 5. CÁLCULO DE TOTALES Y VUELTO
// ==========================================
function parseInput(id) {
  const el = payInputs[id];
  if (!el) return 0;
  const val = parseFloat(el.value);
  return isNaN(val) ? 0 : val;
}

function recalcularTotales() {
  const subtotal = carrito.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unitario)), 0);
  const esDevolucion = subtotal < 0;

  if (btnFiado) btnFiado.disabled = (carrito.length === 0 || esDevolucion);

  // Modo Reintegro / Salida de Efectivo
  if (esDevolucion) {
    payInputs.debito.value = '';
    payInputs.credito.value = '';
    payInputs.qr.value = '';

    const montoReintegro = Math.abs(subtotal);
    cellSubtotal.textContent = `-$ ${montoReintegro.toFixed(2)}`;
    labelRecargo.textContent = '$ 0,00';
    labelTotalPagar.textContent = `-$ ${montoReintegro.toFixed(2)}`;
    displayVuelto.textContent = '$ 0,00';

    btnFacturar.disabled = false;
    btnFacturarText.textContent = `Reintegrar $${montoReintegro.toFixed(2)}`;

    statusBanner.className = "w-full py-2 px-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-center justify-between";
    statusMensaje.textContent = `Salida requerida del cajón en efectivo: $${montoReintegro.toFixed(2)}`;
    return;
  }

  // Venta Normal
   btnFacturarText.textContent = 'Facturar';
  const baseEf = parseInput('efectivo');
  const baseDeb = parseInput('debito');
  const baseCred = parseInput('credito');
  const baseQr = parseInput('qr');

  const pD = pctRecargo('debito');
  const pC = pctRecargo('credito');
  actualizarEtiquetasRecargo(pD, pC);

  const recargoDeb = redondear(baseDeb * pD / 100);
  const recargoCred = redondear(baseCred * pC / 100);
  const recargosTotales = redondear(recargoDeb + recargoCred);

  const totalAPagar = redondear(subtotal + recargosTotales);
  const totalIngresado = redondear(baseEf + (baseDeb + recargoDeb) + (baseCred + recargoCred) + baseQr);
  const diferencia = redondear(totalIngresado - totalAPagar);

  cellSubtotal.textContent = `$ ${subtotal.toFixed(2)}`;
  labelRecargo.textContent = `$ ${recargosTotales.toFixed(2)}`;
  labelTotalPagar.textContent = `$ ${totalAPagar.toFixed(2)}`;

  if (carrito.length === 0) {
    btnFacturar.disabled = true;
    displayVuelto.textContent = '$ 0,00';
    statusBanner.className = "w-full py-2 px-4 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium flex items-center justify-between";
    statusMensaje.textContent = 'Agregue productos para comenzar.';
    return;
  }

  if (Math.abs(diferencia) < 0.01) {
    btnFacturar.disabled = false;
    displayVuelto.textContent = '$ 0,00';
    statusBanner.className = "w-full py-2 px-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between";
    statusMensaje.textContent = 'Total cubierto: los medios de pago coinciden con el importe a pagar.';
  } else if (diferencia > 0) {
    if (baseEf >= diferencia) {
      btnFacturar.disabled = false;
      displayVuelto.textContent = `$ ${diferencia.toFixed(2)}`;
      statusBanner.className = "w-full py-2 px-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between";
      statusMensaje.textContent = `Pago cubierto. Entregar vuelto al cliente.`;
    } else {
      btnFacturar.disabled = true;
      displayVuelto.textContent = '$ 0,00';
      statusBanner.className = "w-full py-2 px-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-center justify-between";
      statusMensaje.textContent = 'El importe con tarjeta o QR no puede superar el total de la venta.';
    }
  } else {
    btnFacturar.disabled = true;
    displayVuelto.textContent = '$ 0,00';
    statusBanner.className = "w-full py-2 px-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-center justify-between";
    statusMensaje.textContent = `Importe pendiente: $ ${Math.abs(diferencia).toFixed(2)} restante para completar el total.`;
  }
}

// Helpers rápidos de efectivo
window.setEfectivoExacto = function() {
  const subtotal = carrito.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unitario)), 0);
  payInputs.efectivo.value = subtotal > 0 ? subtotal.toFixed(2) : '0.00';
  payInputs.debito.value = '';
  payInputs.credito.value = '';
  payInputs.qr.value = '';
  recalcularTotales();
};

window.addEfectivo = function(monto) {
  const actual = parseInput('efectivo');
  payInputs.efectivo.value = (actual + monto).toFixed(2);
  recalcularTotales();
};

// ==========================================
// 6. FACTURACIÓN Y EMISIÓN
// ==========================================
btnFacturar?.addEventListener('click', async () => {
  if (carrito.length === 0) return;
  if (!turnoActivoGlobal) {
    alert('Debe tener un turno abierto.');
    return;
  }

  btnFacturar.disabled = true;

  const subtotal = carrito.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unitario)), 0);
  const esDevolucion = subtotal < 0;

  // El servidor recalcula todo. Acá solo se manda lo que el cajero decidió.
  const pagosArray = [];
  if (!esDevolucion) {
    const ef = parseInput('efectivo');
    const deb = parseInput('debito');
    const cred = parseInput('credito');
    const qr = parseInput('qr');

    if (ef > 0)   pagosArray.push({ forma_pago: 'EFECTIVO', monto: ef });
    if (deb > 0)  pagosArray.push({ forma_pago: 'DEBITO',   monto: deb,  recargo_porcentaje: pctRecargo('debito') });
    if (cred > 0) pagosArray.push({ forma_pago: 'CREDITO',  monto: cred, recargo_porcentaje: pctRecargo('credito') });
    if (qr > 0)   pagosArray.push({ forma_pago: 'QR',       monto: qr });
  }

  const payload = {
    turno_caja_id: turnoActivoGlobal.id,
    terminal_id: terminalActual.id,
    articulos: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })),
    pagos: pagosArray
  };

  try {
    const res = await fetch('/api/v1/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      alert(esDevolucion ? '¡Reintegro registrado en caja!' : '¡Venta registrada con éxito!');
      carrito = [];
      if (modoDevolucionActivo) toggleModoDevolucion();
      renderizarCarrito();
      Object.values(payInputs).forEach(i => { if (i) i.value = ''; });
      recalcularTotales();
      searchInput?.focus();
      return;
    }

    if (data.codigo === 'TURNO_NO_ABIERTO') {
      alert('El turno fue cerrado. Se cancela la venta en curso.');
      carrito = [];
      renderizarCarrito();
      await verificarTurnoAlIniciar();
      return;
    }

    alert(data.error || 'Error al procesar la operación.');
    btnFacturar.disabled = false;
  } catch (error) {
    console.error('Error al facturar:', error);
    alert('Error de conexión con el servidor.');
    btnFacturar.disabled = false;
  }
});

btnCancelar?.addEventListener('click', () => {
  if (carrito.length === 0) return;
  if (confirm('¿Vaciar el comprobante actual?')) {
    carrito = [];
    if (modoDevolucionActivo) toggleModoDevolucion();
    renderizarCarrito();
    Object.values(payInputs).forEach(i => { if (i) i.value = ''; });
    recalcularTotales();
    searchInput?.focus();
  }
});

// ==========================================
// 7. HISTORIAL CON DETALLE Y REEMBOLSO
// ==========================================
btnVerHistorial?.addEventListener('click', async () => {
  if (!turnoActivoGlobal) {
    alert('No hay turno abierto en esta terminal.');
    return;
  }
  await cargarHistorialTurno();
  modalHistorial.classList.remove('hidden');
});

btnCerrarHistorial?.addEventListener('click', () => modalHistorial.classList.add('hidden'));
btnVolverVentas?.addEventListener('click', () => modalHistorial.classList.add('hidden'));

async function cargarHistorialTurno() {
  try {
    historialTbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-500">Cargando ventas...</td></tr>`;
    historialSubtitulo.textContent = `Caja #${cajaIdTerminal} • Turno #${turnoActivoGlobal.id} en curso`;

    const res = await fetch(`/api/v1/ventas/turno/${turnoActivoGlobal.id}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Error al cargar ventas.');
    const ventas = await res.json();

    if (ventas.length === 0) {
      historialTbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400">No hay ventas registradas en este turno.</td></tr>`;
      return;
    }

    historialTbody.innerHTML = '';
    ventas.forEach(v => {
      const hora = new Date(v.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const esReembolsada = String(v.estado).toUpperCase() === 'REEMBOLSADA';
      const esDevolucion = v.tipo_operacion === 'DEVOLUCION_PARCIAL' || Number(v.total) < 0;

      const badges = v.pagos.map(p => {
        return `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 mr-1">${p.medio_pago}</span>`;
      }).join('');

      const trPrincipal = document.createElement('tr');
      trPrincipal.className = `hover:bg-slate-50 transition-colors cursor-pointer ${esReembolsada ? 'bg-red-50/50' : ''}`;

      const nroFormateado = String(v.nro_ticket_turno || v.id).padStart(2, '0');

trPrincipal.innerHTML = `
  <td class="py-3 px-3 font-mono font-bold text-slate-900">
    #${nroFormateado}
    ${esReembolsada ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">REEMBOLSADO</span>' : ''}
    ${esDevolucion ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">REINTEGRO</span>' : ''}
  </td>
  <td class="py-3 px-3 text-slate-500">${hora} hs</td>
  <td class="py-3 px-3">${badges}</td>
  <td class="py-3 px-3 text-right font-mono font-bold ${esReembolsada || esDevolucion ? 'text-red-600' : 'text-slate-900'}">
    ${esReembolsada ? `-$ ${Math.abs(Number(v.total)).toFixed(2)}` : `$ ${Number(v.total).toFixed(2)}`}
  </td>
`;

      const trDetalle = document.createElement('tr');
      trDetalle.className = 'hidden bg-slate-900 text-white';
      trDetalle.innerHTML = `
        <td colspan="4" class="p-4">
          <div id="contenido-detalle-${v.id}" class="text-xs">
            <em>Cargando detalle...</em>
          </div>
        </td>
      `;

      trPrincipal.addEventListener('click', async () => {
        const estaAbierto = !trDetalle.classList.contains('hidden');
        document.querySelectorAll('#historial-tbody tr.bg-slate-900').forEach(el => el.classList.add('hidden'));

        if (!estaAbierto) {
          trDetalle.classList.remove('hidden');
          await renderizarContenidoDetalle(v.id, esReembolsada, esDevolucion);
        }
      });

      historialTbody.appendChild(trPrincipal);
      historialTbody.appendChild(trDetalle);
    });
  } catch (err) {
    historialTbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-red-500">${err.message}</td></tr>`;
  }
}

async function renderizarContenidoDetalle(ventaId, esReembolsada, esDevolucion) {
  const contenedor = document.getElementById(`contenido-detalle-${ventaId}`);
  try {
    const res = await fetch(`/api/v1/ventas/${ventaId}/detalle`, { credentials: 'include' });
    if (!res.ok) throw new Error('No se pudo cargar el detalle.');
    const data = await res.json();

    let itemsHtml = `
      <div class="font-bold mb-2 uppercase text-slate-400 tracking-wider text-[11px]">Artículos del Ticket:</div>
      <table class="w-full mb-3 text-left border-collapse">
    `;

    data.articulos.forEach(art => {
      itemsHtml += `
        <tr class="border-b border-slate-800">
          <td class="py-1">${escapeHtml(art.descripcion)}</td>
          <td class="py-1 text-center">${Number(art.cantidad)} u.</td>
          <td class="py-1 text-right">$ ${Number(art.precio_unitario).toFixed(2)}</td>
          <td class="py-1 text-right font-bold">$ ${Number(art.subtotal).toFixed(2)}</td>
        </tr>
      `;
    });
    itemsHtml += `</table>`;

    let footerHtml = '';
    if (esReembolsada) {
      footerHtml = `<div class="text-red-400 font-bold text-right pt-2">Esta venta fue anulada y reembolsada.</div>`;
    } else if (esDevolucion) {
      footerHtml = `<div class="text-amber-400 font-bold text-right pt-2">Comprobante de reintegro por devolución.</div>`;
    } else if(Auth.can('venta.reembolsar')) {
      footerHtml = `
        <div class="flex justify-end pt-2 border-t border-slate-800">
          <button type="button" onclick="solicitarReembolso(${ventaId})" class="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold transition-colors">
            Reembolsar Ticket Completo
          </button>
        </div>
      `;
    }
    else{
      footerHtml = '';
    }

    contenedor.innerHTML = itemsHtml + footerHtml;
  } catch (err) {
    contenedor.innerHTML = `<span class="text-red-400">${err.message}</span>`;
  }
}

window.solicitarReembolso = async function(ventaId) {
  if (!confirm(`¿Confirma el reembolso completo del Ticket #${ventaId}?\nEl dinero saldrá de la gaveta actual y los productos regresarán al stock.`)) return;

  try {
    const res = await fetch(`/api/v1/ventas/${ventaId}/reembolso`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ terminal_id: terminalActual.id })
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'No se pudo procesar el reembolso.');
      return;
    }

    alert('Venta reembolsada con éxito.');
    await cargarHistorialTurno();
  } catch (err) {
    alert('Error al procesar el reembolso: ' + err.message);
  }
};

// ==========================================
// 8. FIADO DE EMPLEADOS
// ==========================================
btnFiado?.addEventListener('click', async () => {
  if (carrito.length === 0) return;

  const subtotal = carrito.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unitario)), 0);
  fiadoTotalDisplay.textContent = `$ ${subtotal.toFixed(2)}`;

  await cargarListaEmpleadosParaFiado();
  modalFiado.classList.remove('hidden');
});

btnCancelarFiado?.addEventListener('click', () => modalFiado.classList.add('hidden'));

async function cargarListaEmpleadosParaFiado() {
  selectEmpleadoFiado.innerHTML = '';
  try {
    const res = await fetch('/api/v1/usuarios/operadores', { credentials: 'include' });
    if (res.ok) {
      const usuarios = await res.json();
      usuarios.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nombre} ${u.apellido || ''} (DNI: ${u.dni})`;
        if (u.id === sesionActual.id) opt.selected = true;
        selectEmpleadoFiado.appendChild(opt);
      });
      return;
    }
  } catch {}

  const opt = document.createElement('option');
  opt.value = sesionActual.id;
  opt.textContent = `${sesionActual.nombre} ${sesionActual.apellido || ''} (Cajero Actual)`;
  selectEmpleadoFiado.appendChild(opt);
}

btnConfirmarFiado?.addEventListener('click', async () => {
  const empleadoId = Number(selectEmpleadoFiado.value);

  const payload = {
    turno_caja_id: turnoActivoGlobal.id,
    terminal_id: terminalActual.id,
    articulos: carrito.map(i => ({ producto_id: i.id, cantidad: i.cantidad })),
    empleado_fiado_id: empleadoId
  };

  try {
    const res = await fetch('/api/v1/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al asentar el fiado.');
    }

    alert('Fiado asentado correctamente para descuento por sueldo.');
    modalFiado.classList.add('hidden');

    carrito = [];
    renderizarCarrito();
    Object.values(payInputs).forEach(i => { if (i) i.value = ''; });
    recalcularTotales();
    searchInput?.focus();
  } catch (error) {
    alert(error.message);
  }
});

// ==========================================
// 9. EVENTOS UI Y ATAJOS DE TECLADO
// ==========================================
function configurarEventosUI() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') {
      e.preventDefault();
      if (Auth.can('venta.devolucion')) toggleModoDevolucion();
    }

    if (e.key === 'F4') {
      e.preventDefault();
      btnVerHistorial?.click();
    }
    if (e.key === 'F8' && !btnFiado?.disabled && Auth.can('venta.fiado')) {
      e.preventDefault();
      btnFiado?.click();
    }
    if (e.key === 'F12' && !btnFacturar?.disabled) {
      e.preventDefault();
      btnFacturar?.click();
    }
    if (e.key === 'Escape') {
      if (!modalHistorial.classList.contains('hidden')) {
        modalHistorial.classList.add('hidden');
        return;
      }
      if (!modalFiado.classList.contains('hidden')) {
        modalFiado.classList.add('hidden');
        return;
      }
      if (!modalCierrePOS.classList.contains('hidden')) {
        modalCierrePOS.classList.add('hidden');
        return;
      }
      btnCancelar?.click();
    }
  });

  searchInput?.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(debounceTimeout); 
    const codigo = searchInput.value.trim();

    if (codigo.length < 2 || /^\d{6,}$/.test(codigo)) {
      ocultarSugerencias();
      return;
    }

    try {
      const res = await fetch(`/api/v1/productos/codigo/${encodeURIComponent(codigo)}`, { credentials: 'include' });
      if (!res.ok) {
        alert('Producto no encontrado o inactivo');
        searchInput.value = '';
        return;
      }

      const producto = await res.json();
      agregarAlCarrito(producto);
      searchInput.value = '';
      ocultarSugerencias();
    } catch (error) {
      console.error('Error al pistolear código:', error);
    }
  }
});

  searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(debounceTimeout);

    if (query.length < 2 || /^\d{6,}$/.test(query)) {
      ocultarSugerencias();
      return;
    }

    debounceTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/productos/buscar?q=${encodeURIComponent(query)}`, { credentials: 'include' });
        if (!res.ok) {
          console.error('Búsqueda rechazada:', res.status);
          ocultarSugerencias();
          return;
        }
        const productos = await res.json();
        mostrarSugerencias(Array.isArray(productos) ? productos : []);
      } catch (err) {
        console.error('Error en sugerencias:', err);
      }
    }, 250);
  });

  Object.values(payInputs).forEach(inp => {
    if (inp) inp.addEventListener('input', recalcularTotales);
  });

    ['pct-debito', 'pct-credito'].forEach(id =>
    document.getElementById(id)?.addEventListener('input', recalcularTotales));

  document.addEventListener('click', (e) => {
    if (!searchInput?.contains(e.target) && !suggestionsList?.contains(e.target)) {
      ocultarSugerencias();
    }
  });
}

function mostrarSugerencias(productos) {
  suggestionsList.innerHTML = '';
  if (!productos || productos.length === 0) {
    ocultarSugerencias();
    return;
  }

  productos.forEach(prod => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div>
        <div class="font-medium text-slate-800 text-sm">${escapeHtml(prod.descripcion)}</div>
        ${prod.es_combo ? '<span class="text-[10px] text-indigo-600 font-bold">[PROMO / COMBO]</span>' : ''}
      </div>
      <span class="font-mono font-bold text-slate-900 text-sm">$ ${parseFloat(prod.precio_minorista || prod.precio).toFixed(2)}</span>
    `;
    li.addEventListener('click', () => {
      agregarAlCarrito(prod);
      searchInput.value = '';
      ocultarSugerencias();
      searchInput.focus();
    });
    suggestionsList.appendChild(li);
  });

  suggestionsList.classList.remove('hidden');
}

function ocultarSugerencias() {
  if (suggestionsList) {
    suggestionsList.innerHTML = '';
    suggestionsList.classList.add('hidden');
  }
}

window.modificarCantidad = function(index, delta) {
  const item = carrito[index];
  if (!item) return;

  const esPesable = (item.unidad_medida || '').toUpperCase() === 'KILO' || (item.unidad_medida || '').toUpperCase() === 'KG';
  // 100 gramos para fiambres/pesables, 1 unidad para el resto
  const paso = esPesable ? 0.100 : 1;
  const pasoFinal = item.cantidad < 0 ? -paso : paso;

  const nuevaCant = Number((Number(item.cantidad) + (delta > 0 ? pasoFinal : -pasoFinal)).toFixed(3));

  if (Math.abs(nuevaCant) > 0.0001) {
    item.cantidad = nuevaCant;
    renderizarCarrito();
  } else {
    window.eliminarFila(index);
  }
};

window.cambiarCantidadManual = function(index, valor) {
  const item = carrito[index];
  if (!item) return;

  const esPesable = (item.unidad_medida || '').toUpperCase() === 'KILO' || (item.unidad_medida || '').toUpperCase() === 'KG';
  const num = parseFloat(valor);

  if (!isNaN(num) && num !== 0 && Auth.can('venta.devolucion')) {
    item.cantidad = esPesable ? Number(num.toFixed(3)) : Math.round(num);
  }
  renderizarCarrito();
};

window.eliminarFila = function(index) {
  carrito.splice(index, 1);
  renderizarCarrito();
};

window.cerrarSesion = () => Auth.logout();

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}