// ==========================================
// ESTADO GLOBAL DE LA TERMINAL
// ==========================================
let sesionActual = null;
let turnoActivoGlobal = null;
let cajaIdTerminal = null;
let carrito = [];
let debounceTimeout = null;

// Elementos DOM Principales
const userDisplay = document.getElementById('user-display');
const barcodeInput = document.getElementById('barcode-input');
const suggestionsList = document.getElementById('search-suggestions');
const cartRows = document.getElementById('cart-rows');
const cellSubtotal = document.getElementById('cell-subtotal');
const labelTotalPagar = document.getElementById('label-total-pagar');
const labelRecargo = document.getElementById('label-recargo');
const btnFacturar = document.getElementById('btn-facturar');
const btnCancelar = document.getElementById('btn-cancelar');
const statusMessage = document.getElementById('payment-status-message');

// Inputs de Medios de Pago
const payInputs = {
  efectivo: document.getElementById('pay-efectivo'),
  debito: document.getElementById('pay-debito'),
  credito: document.getElementById('pay-credito'),
  qr: document.getElementById('pay-qr')
};

// Modales de Turno
const modalApertura = document.getElementById('modal-apertura-turno');
const formApertura = document.getElementById('form-apertura-turno');
const inputAperturaMonto = document.getElementById('input-apertura-monto');

const modalCierrePOS = document.getElementById('modal-cierre-turno-pos');
const inputMontoRealPOS = document.getElementById('input-pos-monto-real');
const btnAbrirCierre = document.getElementById('btn-cierre-turno-pos');
const btnCancelarCierre = document.getElementById('btn-pos-close-modal-cancel');
const btnCierreDefinitivo = document.getElementById('btn-pos-cierre-definitivo');
const btnCierreRapido = document.getElementById('btn-pos-cierre-rapido');

// ==========================================
// 1. INICIALIZACIÓN Y CONTROL DE TURNOS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  await iniciarTerminal();
  configurarEventosUI();
});

async function iniciarTerminal() {
  try {
    // 1. Validar autenticación
    const resAuth = await fetch('/api/v1/auth/me', { credentials: 'include' });
    if (!resAuth.ok) {
      window.location.replace('index.html');
      return;
    }
    const dataAuth = await resAuth.json();
    sesionActual = dataAuth.user;

    if (sesionActual.rol !== 'CAJERO' && sesionActual.rol !== 'ADMINISTRADOR') {
      alert('Acceso restringido únicamente a cajeros y administradores.');
      window.location.replace('index.html');
      return;
    }

    if (userDisplay) {
      userDisplay.textContent = `Cajero: ${sesionActual.nombre} ${sesionActual.apellido || ''}`;
    }

    // 2. Determinar la Caja de esta Terminal
    // Se toma de la sesión del usuario o de una configuración local persistida
    cajaIdTerminal = sesionActual.caja_fisica_id || localStorage.getItem('pos_caja_fisica_id') || 1;

    // 3. Chequear si existe un turno abierto
    await verificarTurnoAlIniciar();

  } catch (error) {
    console.error('Error durante la inicialización:', error);
    window.location.replace('index.html');
  }
}

async function verificarTurnoAlIniciar() {
  try {
    const res = await fetch(`/api/v1/turno_caja/activo?caja_fisica_id=${cajaIdTerminal}`, { credentials: 'include' });

    if (!res.ok) {
      throw new Error(`El servidor respondió con status ${res.status}`);
    }

    const turno = await res.json();

    if (turno && turno.id && turno.estado === 'ABIERTO') {
      turnoActivoGlobal = turno;
      if (modalApertura) modalApertura.style.display = 'none';
      barcodeInput?.focus();
    } else {
      // Si el turno es null o está EN_CIERRE/CERRADO -> abrir modal para ingresar fondo inicial
      turnoActivoGlobal = null;
      if (modalApertura) {
        modalApertura.style.display = 'flex';
        setTimeout(() => inputAperturaMonto?.focus(), 100);
      }
    }
  } catch (err) {
    console.error('Error al chequear turno activo:', err);
    // Mostrar el modal de apertura ante la ausencia de turno activo
    if (modalApertura) modalApertura.style.display = 'flex';
  }
}

// ==========================================
// 2. FLUJOS DE APERTURA Y CIERRE DE TURNO
// ==========================================

// Apertura de turno con fondo inicial
formApertura?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = parseFloat(inputAperturaMonto.value);

  if (isNaN(monto) || monto < 0) {
    alert('Por favor ingrese un monto inicial válido.');
    inputAperturaMonto.focus();
    return;
  }

  try {
    const res = await fetch('/api/v1/turno_caja/abrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        caja_fisica_id: Number(cajaIdTerminal),
        monto_inicial_efectivo: monto,
        nombre_turno: 'MAÑANA' // Ajusta al valor permitido por tu enum (ej: MAÑANA, TARDE, NOCHE)
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo abrir el turno.');
    }

    turnoActivoGlobal = await res.json();
    modalApertura.style.display = 'none';
    barcodeInput?.focus();
    alert(`Turno #${turnoActivoGlobal.id} abierto correctamente.`);
  } catch (err) {
    alert(err.message);
  }
});

// Apertura del modal de cierre
btnAbrirCierre?.addEventListener('click', () => {
  if (!turnoActivoGlobal) {
    alert('No hay un turno activo en esta terminal.');
    return;
  }
  inputMontoRealPOS.value = '';
  modalCierrePOS.style.display = 'flex';
  inputMontoRealPOS.focus();
});

btnCancelarCierre?.addEventListener('click', () => {
  modalCierrePOS.style.display = 'none';
});

// Cierre de Turno Definitivo (con conteo físico)
btnCierreDefinitivo?.addEventListener('click', async () => {
  const monto = parseFloat(inputMontoRealPOS.value);
  if (isNaN(monto) || monto < 0) {
    alert('Para realizar el CIERRE DE TURNO debe ingresar el total del efectivo contado en caja.');
    inputMontoRealPOS.focus();
    return;
  }

  if (!confirm(`¿Confirma el cierre definitivo de caja con un conteo en efectivo de $${monto.toFixed(2)}?`)) return;

  await procesarCierre({ tipo: 'DEFINITIVO', monto_real: monto });
});

// Cierre Rápido (sin conteo físico)
btnCierreRapido?.addEventListener('click', async () => {
  if (!confirm('¿Confirma el CIERRE RÁPIDO?\nEl arqueo físico quedará pendiente para su auditoría posterior.')) return;

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
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al procesar el cierre del turno.');
    }

    alert('Turno finalizado con éxito.');
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.replace('index.html');
  } catch (err) {
    alert(err.message);
  }
}

// ==========================================
// 3. CARRITO Y VENTA DE PRODUCTOS
// ==========================================

function agregarAlCarrito(producto) {
  const unidad = (producto.unidad_medida || 'UNIDAD').toUpperCase();
  const esPesable = unidad === 'KILO' || unidad === 'KG';

  const itemExistente = carrito.find(p => p.id === producto.id);

  if (itemExistente) {
    const incremento = esPesable ? 0.100 : 1;
    itemExistente.cantidad = Number((Number(itemExistente.cantidad) + incremento).toFixed(3));
  } else {
    carrito.push({
      id: producto.id,
      descripcion: producto.descripcion,
      precio_unitario: Number(producto.precio_minorista || producto.precio),
      unidad_medida: esPesable ? 'KILO' : 'UNIDAD',
      cantidad: esPesable ? 1.000 : 1
    });
  }
  renderizarCarrito();
}

function renderizarCarrito() {
  cartRows.innerHTML = '';

  carrito.forEach((item, index) => {
    const esPesable = (item.unidad_medida || '').toUpperCase() === 'KILO' || 
                      (item.unidad_medida || '').toUpperCase() === 'KG';

    const totalItem = Number(item.cantidad) * Number(item.precio_unitario);
    const cantidadMostrada = esPesable ? Number(item.cantidad).toFixed(3) : item.cantidad;
    const stepValue = esPesable ? "0.050" : "1";
    const etiquetaUnidad = esPesable ? '<span style="font-size:0.75rem; color:#64748b; margin-left:3px;">kg</span>' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${item.descripcion}</strong>
        ${esPesable ? '<br><small style="color:#0284c7; font-size:0.72rem; font-weight:600;">(Venta al peso - Precio x Kg)</small>' : ''}
      </td>
      <td style="text-align: center;">
        <div class="qty-stepper">
          <button type="button" class="qty-btn" onclick="modificarCantidad(${index}, -1)">&minus;</button>
          <input 
            type="number" 
            class="qty-input" 
            value="${cantidadMostrada}" 
            min="0.001" 
            step="${stepValue}"
            onclick="this.select()"
            onchange="cambiarCantidadManual(${index}, this.value)"
            style="${esPesable ? 'width: 58px;' : 'width: 44px;'}"
          >
          <button type="button" class="qty-btn" onclick="modificarCantidad(${index}, 1)">&plus;</button>
        </div>
        ${etiquetaUnidad}
      </td>
      <td class="text-right">$${Number(item.precio_unitario).toFixed(2)}</td>
      <td class="text-right bold">$${totalItem.toFixed(2)}</td>
      <td><button class="btn-remove" onclick="eliminarFila(${index})">&times;</button></td>
    `;
    cartRows.appendChild(tr);
  });

  recalcularTotales();
}

function recalcularTotales() {
  try {
    const subtotal = carrito.reduce((acc, item) => acc + (Number(item.cantidad) * Number(item.precio_unitario)), 0);

    const baseEfectivo = parseFloat(payInputs.efectivo?.value) || 0;
    const baseDebito = parseFloat(payInputs.debito?.value) || 0;
    const baseCredito = parseFloat(payInputs.credito?.value) || 0;
    const baseQR = parseFloat(payInputs.qr?.value) || 0;

    // Recargo comercial del 10% en tarjetas
    const recargoDebito = parseFloat((baseDebito * 0.10).toFixed(2));
    const recargoCredito = parseFloat((baseCredito * 0.10).toFixed(2));
    const recargosTotales = parseFloat((recargoDebito + recargoCredito).toFixed(2));

    const totalAPagar = parseFloat((subtotal + recargosTotales).toFixed(2));

    const totalIngresado = parseFloat((
      baseEfectivo + 
      (baseDebito + recargoDebito) + 
      (baseCredito + recargoCredito) + 
      baseQR
    ).toFixed(2));

    const diferencia = parseFloat((totalIngresado - totalAPagar).toFixed(2));

    if (cellSubtotal) cellSubtotal.textContent = `$${subtotal.toFixed(2)}`;
    if (labelRecargo) labelRecargo.textContent = `Recargos (Tarjetas 10%): $${recargosTotales.toFixed(2)}`;
    if (labelTotalPagar) labelTotalPagar.textContent = `$${totalAPagar.toFixed(2)}`;

    const labelDebito = document.querySelector('label[for="pay-debito"]');
    const labelCredito = document.querySelector('label[for="pay-credito"]');

    if (labelDebito) {
      const posnetD = baseDebito > 0 ? ` (Cobrar: $${(baseDebito + recargoDebito).toFixed(2)})` : '';
      labelDebito.textContent = `Débito (+10%)${posnetD}`;
    }

    if (labelCredito) {
      const posnetC = baseCredito > 0 ? ` (Cobrar: $${(baseCredito + recargoCredito).toFixed(2)})` : '';
      labelCredito.textContent = `Crédito (+10%)${posnetC}`;
    }

    if (carrito.length === 0) {
      if (btnFacturar) btnFacturar.disabled = true;
      if (statusMessage) {
        statusMessage.className = 'payment-diff diff-missing';
        statusMessage.textContent = 'Agregue productos para comenzar.';
      }
      return;
    }

    if (Math.abs(diferencia) < 0.01) {
      if (btnFacturar) btnFacturar.disabled = false;
      if (statusMessage) {
        statusMessage.className = 'payment-diff diff-exact';
        statusMessage.textContent = `Total cubierto. Listo para facturar ($${totalAPagar.toFixed(2)}).`;
      }
    } else if (diferencia > 0) {
      if (baseEfectivo >= diferencia) {
        if (btnFacturar) btnFacturar.disabled = false;
        if (statusMessage) {
          statusMessage.className = 'payment-diff diff-excess';
          statusMessage.textContent = `Vuelto a entregar (Efectivo): $${diferencia.toFixed(2)}`;
        }
      } else {
        if (btnFacturar) btnFacturar.disabled = true;
        if (statusMessage) {
          statusMessage.className = 'payment-diff diff-missing';
          statusMessage.textContent = `El monto en tarjetas/QR supera el total de la venta.`;
        }
      }
    } else {
      if (btnFacturar) btnFacturar.disabled = true;
      if (statusMessage) {
        statusMessage.className = 'payment-diff diff-missing';
        statusMessage.textContent = `Faltan: $${Math.abs(diferencia).toFixed(2)} para completar la venta.`;
      }
    }
  } catch (error) {
    console.error('Error al recalcular totales:', error);
  }
}

// ==========================================
// 4. FACTURACIÓN Y TRANSACCIÓN
// ==========================================
btnFacturar?.addEventListener('click', async () => {
  if (carrito.length === 0) return;
  if (!turnoActivoGlobal) {
    alert('Debe tener un turno abierto para realizar ventas.');
    return;
  }

  btnFacturar.disabled = true;

  const pagosArray = [];
  const efvo = parseFloat(payInputs.efectivo?.value) || 0;
  const deb = parseFloat(payInputs.debito?.value) || 0;
  const cred = parseFloat(payInputs.credito?.value) || 0;
  const qr = parseFloat(payInputs.qr?.value) || 0;

  if (efvo > 0) pagosArray.push({ forma_pago: 'EFECTIVO', monto: efvo });
  if (deb > 0) pagosArray.push({ forma_pago: 'DEBITO', monto: deb });
  if (cred > 0) pagosArray.push({ forma_pago: 'CREDITO', monto: cred });
  if (qr > 0) pagosArray.push({ forma_pago: 'QR', monto: qr });

  const totalCalculado = parseFloat(labelTotalPagar.textContent.replace('$', '')) || 0;

  const payload = {
    turno_caja_id: turnoActivoGlobal.id,
    terminal_id: sesionActual.terminal_id || 1,
    total: totalCalculado,
    articulos: carrito,
    pagos: pagosArray
  };

  try {
    const res = await fetch('/api/v1/ventas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (res.ok) {
      alert('¡Venta realizada con éxito!');
      carrito = [];
      renderizarCarrito();
      Object.values(payInputs).forEach(inp => { if (inp) inp.value = ''; });
      recalcularTotales();
      barcodeInput?.focus();
    } else {
      alert(data.error || data.message || 'Error al procesar la venta');
      btnFacturar.disabled = false;
    }
  } catch (error) {
    console.error('Error al facturar:', error);
    alert('Error de conexión al procesar la venta');
    btnFacturar.disabled = false;
  }
});

btnCancelar?.addEventListener('click', () => {
  if (carrito.length === 0) return;
  if (confirm('¿Desea vaciar el carrito actual?')) {
    carrito = [];
    renderizarCarrito();
    Object.values(payInputs).forEach(inp => { if (inp) inp.value = ''; });
    recalcularTotales();
    barcodeInput?.focus();
  }
});

// ==========================================
// 5. CONFIGURACIÓN DE EVENTOS Y BUSCADOR
// ==========================================
function configurarEventosUI() {
  // Lector de código de barras
  barcodeInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const codigo = barcodeInput.value.trim();
      if (!codigo) return;

      try {
        const res = await fetch(`/api/v1/productos/codigo/${encodeURIComponent(codigo)}`);
        if (!res.ok) {
          alert('Producto no encontrado o inactivo');
          barcodeInput.value = '';
          return;
        }

        const producto = await res.json();
        agregarAlCarrito(producto);
        barcodeInput.value = '';
        ocultarSugerencias();
      } catch (error) {
        console.error('Error de lectura:', error);
      }
    }
  });

  // Autocompletado predictivo
  barcodeInput?.addEventListener('input', () => {
    const query = barcodeInput.value.trim();
    clearTimeout(debounceTimeout);

    if (query.length < 2 || /^\d{6,}$/.test(query)) {
      ocultarSugerencias();
      return;
    }

    debounceTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/productos/buscar?q=${encodeURIComponent(query)}`);
        const productos = await res.json();
        mostrarSugerencias(productos);
      } catch (err) {
        console.error('Error al autocompletar:', err);
      }
    }, 250);
  });

  // Inputs de pago
  Object.values(payInputs).forEach(input => {
    if (input) input.addEventListener('input', recalcularTotales);
  });

  // Cerrar sugerencias al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!barcodeInput?.contains(e.target) && !suggestionsList?.contains(e.target)) {
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
      <span>${prod.descripcion}</span>
      <span class="item-price">$${parseFloat(prod.precio_minorista).toFixed(2)}</span>
    `;
    li.addEventListener('click', () => {
      agregarAlCarrito(prod);
      barcodeInput.value = '';
      ocultarSugerencias();
      barcodeInput.focus();
    });
    suggestionsList.appendChild(li);
  });

  suggestionsList.hidden = false;
}

function ocultarSugerencias() {
  if (suggestionsList) {
    suggestionsList.innerHTML = '';
    suggestionsList.hidden = true;
  }
}

// Cierre de sesión
window.cerrarSesion = async function() {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.replace('index.html');
};

// Modificadores de fila expuestos para el HTML
window.modificarCantidad = function(index, direccion) {
  const item = carrito[index];
  if (!item) return;

  const esPesable = (item.unidad_medida || '').toUpperCase() === 'KILO' || 
                    (item.unidad_medida || '').toUpperCase() === 'KG';

  const paso = esPesable ? 0.100 : 1;
  const delta = direccion > 0 ? paso : -paso;
  const nuevaCantidad = Number((Number(item.cantidad) + delta).toFixed(3));

  if (nuevaCantidad > 0) {
    item.cantidad = nuevaCantidad;
    renderizarCarrito();
  } else {
    window.eliminarFila(index);
  }
};

window.cambiarCantidadManual = function(index, valorTexto) {
  const item = carrito[index];
  if (!item) return;

  const esPesable = (item.unidad_medida || '').toUpperCase() === 'KILO' || 
                    (item.unidad_medida || '').toUpperCase() === 'KG';

  const num = parseFloat(valorTexto);
  if (!isNaN(num) && num > 0) {
    item.cantidad = esPesable ? Number(num.toFixed(3)) : Math.floor(num);
  }
  renderizarCarrito();
};

window.eliminarFila = function(index) {
  carrito.splice(index, 1);
  renderizarCarrito();
};