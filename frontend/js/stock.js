document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let sucursalesList = [];
  let productosList = [];
  let rawStockList = [];
  let selectedSucursalId = 'all'; // 'all' o ID numérico
  let searchTerm = '';
  let currentEditingId = null;
  let onConfirmCallback = null;

  // Elementos DOM
  const tbody = document.getElementById('stock-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const branchTabsContainer = document.getElementById('branch-tabs');
  const inputSearch = document.getElementById('input-search-stock');
  const stockSummaryText = document.getElementById('stock-summary-text');

  // Modal Confirmación
  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  // 1. Verificación de sesión con /api/v1/auth/me
  async function verificarSesion() {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.user?.rol !== 'ADMINISTRADOR') {
        alert('Acceso exclusivo para administradores.');
        window.location.replace('index.html');
        return;
      }

      userDisplay.textContent = `${data.user.nombre} ${data.user.apellido}`;
    } catch {
      window.location.replace('index.html');
    }
  }

  // 2. Cargar Sucursales y Productos en paralelo para resolver nombres
  async function cargarCatalogosBase() {
    try {
      const [resSuc, resProd] = await Promise.all([
        fetch('/api/v1/sucursales', { credentials: 'include' }),
        fetch('/api/v1/productos', { credentials: 'include' })
      ]);

      if (resSuc.ok) sucursalesList = await resSuc.json();
      if (resProd.ok) productosList = await resProd.json();

      renderizarPestañasSucursales();
    } catch (err) {
      console.error('Error cargando sucursales/productos base:', err);
    }
  }

  // Renderiza las pestañas de selección de sucursal
  function renderizarPestañasSucursales() {
    branchTabsContainer.innerHTML = `
      <button type="button" class="tab-pill ${selectedSucursalId === 'all' ? 'active' : ''}" data-id="all">
        Todas las sucursales
      </button>
    `;

    sucursalesList.forEach(s => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tab-pill ${selectedSucursalId === String(s.id) ? 'active' : ''}`;
      btn.dataset.id = s.id;
      btn.textContent = s.es_deposito_central ? `${s.nombre} (Depósito)` : s.nombre;
      
      btn.addEventListener('click', () => {
        selectedSucursalId = String(s.id);
        actualizarTabsUI();
        cargarStockSegunFiltro();
      });

      branchTabsContainer.appendChild(btn);
    });

    branchTabsContainer.querySelector('[data-id="all"]').addEventListener('click', () => {
      selectedSucursalId = 'all';
      actualizarTabsUI();
      cargarStockSegunFiltro();
    });
  }

  function actualizarTabsUI() {
    branchTabsContainer.querySelectorAll('.tab-pill').forEach(btn => {
      if (btn.dataset.id === selectedSucursalId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 3. Obtener Stock usando los endpoints correspondientes del backend
  async function cargarStockSegunFiltro() {
  try {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem;">Consultando existencias en base de datos...</td></tr>`;

    let url = '/api/v1/stock_sucursal';
    if (selectedSucursalId !== 'all') {
      url = `/api/v1/stock_sucursal/${selectedSucursalId}`;
    }

    const res = await fetch(url, { credentials: 'include' });

    if (!res.ok) {
      throw new Error(`Error ${res.status}: No se pudo obtener el stock`);
    }

    const textData = await res.text();
    rawStockList = textData ? JSON.parse(textData) : [];

    renderizarTabla();
  } catch (err) {
    console.error("Fallo detallado:", err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: #ef4444;">${err.message}</td></tr>`;
  }
}

  // 4. Renderizado de Grilla con sustitución de IDs por Nombres
  function renderizarTabla() {
  tbody.innerHTML = '';

  // Filtrado por buscador / escáner de código de barras
  const filteredStock = rawStockList.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();

    // Resolución de nombres
    const prod = productosList.find(p => p.id === item.producto_id);
    const prodDesc = (item.producto_nombre || prod?.descripcion || '').toLowerCase();
    const codBarra = (item.codigo_barra || prod?.codigo_barra || '').toLowerCase();

    return prodDesc.includes(term) || codBarra.includes(term);
  });

  if (filteredStock.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem;">No se encontraron registros de stock para este filtro.</td></tr>`;
    stockSummaryText.textContent = `0 artículos encontrados`;
    return;
  }

  let sumaTotalItems = 0;

  filteredStock.forEach(item => {
    // Resolución de sucursal y producto
    const sucursalObj = sucursalesList.find(s => s.id === item.sucursal_id);
    const nombreSucursal = item.sucursal_nombre || sucursalObj?.nombre || `Sucursal #${item.sucursal_id}`;

    const prodObj = productosList.find(p => p.id === item.producto_id);
    const nombreProducto = item.producto_nombre || prodObj?.descripcion || `Producto #${item.producto_id}`;
    const codBarra = item.codigo_barra || prodObj?.codigo_barra || '-';

    // Detección de unidad de medida (KILO vs UNIDAD)
    const unidad = (item.unidad_medida || prodObj?.unidad_medida || 'UNIDAD').toUpperCase();
    const esPesable = unidad === 'KILO' || unidad === 'KG';

    const cant = Number(item.cantidad_disponible || 0);
    const min = Number(item.stock_minimo || 0);
    sumaTotalItems += cant;

    // Formateo según tipo de unidad
    const cantFormateada = esPesable ? cant.toFixed(1) : Math.floor(cant);
    const minFormateado = esPesable ? min.toFixed(1) : Math.floor(min);
    const etiquetaUnidad = esPesable ? 'kg' : 'u.';
    const stepVal = esPesable ? '0.1' : '1';

    // Determinación de semáforo
    let statusClass = 'status-ok';
    let statusText = 'Normal';
    if (cant === 0) {
      statusClass = 'status-critical';
      statusText = 'Agotado';
    } else if (cant <= min) {
      statusClass = 'status-warning';
      statusText = 'Bajo Stock';
    }

    const tr = document.createElement('tr');
    tr.dataset.id = item.id;

    if (currentEditingId === item.id) {
      // Modo Edición Inline
      tr.classList.add('editing-row');
      tr.innerHTML = `
        <td>${item.id}</td>
        <td><strong>${escapeHtml(nombreSucursal)}</strong></td>
        <td style="font-family: monospace;">${escapeHtml(codBarra)}</td>
        <td>
          ${escapeHtml(nombreProducto)}
          ${esPesable ? '<br><small style="color:#0284c7; font-weight:600;">(Venta por peso)</small>' : ''}
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; align-items:center; gap:4px;">
            <input 
              type="number" 
              class="table-input" 
              style="text-align:right; width: 85px;" 
              id="edit-cant-${item.id}" 
              value="${cantFormateada}" 
              step="${stepVal}" 
              min="0"
              onclick="this.select()"
            >
            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">${etiquetaUnidad}</span>
          </div>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; align-items:center; gap:4px;">
            <input 
              type="number" 
              class="table-input" 
              style="text-align:right; width: 85px;" 
              id="edit-min-${item.id}" 
              value="${minFormateado}" 
              step="${stepVal}" 
              min="0"
              onclick="this.select()"
            >
            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">${etiquetaUnidad}</span>
          </div>
        </td>
        <td style="text-align:center;">
          <span class="status-indicator ${statusClass}" title="${statusText}"></span>
        </td>
        <td class="row-actions-cell">
          <div class="inline-actions-container">
            <button type="button" class="btn-inline-accept" onclick="window.__adminStock.solicitarGuardado(${item.id})">Aceptar</button>
            <button type="button" class="btn-inline-cancel" onclick="window.__adminStock.cancelarEdicion()">Cancelar</button>
          </div>
        </td>
      `;
    } else {
      // Modo Lectura
      tr.innerHTML = `
        <td>${item.id}</td>
        <td><strong>${escapeHtml(nombreSucursal)}</strong></td>
        <td style="font-family: monospace; font-weight:600;">${escapeHtml(codBarra)}</td>
        <td><strong>${escapeHtml(nombreProducto)}</strong></td>
        <td style="text-align:right; font-weight:600; font-size:0.95rem;">
          ${cantFormateada} <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">${etiquetaUnidad}</span>
        </td>
        <td style="text-align:right; color:#64748b;">
          ${minFormateado} <span style="font-size:0.75rem; color:#94a3b8;">${etiquetaUnidad}</span>
        </td>
        <td style="text-align:center;">
          <span class="status-indicator ${statusClass}" title="${statusText}"></span>
        </td>
        <td class="row-actions-cell">
          <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminStock.toggleDropdown(${item.id})">&#8942;</button>
          <div id="dropdown-${item.id}" class="row-dropdown-menu" hidden>
            <button type="button" class="menu-item menu-item-edit" onclick="window.__adminStock.iniciarEdicion(${item.id})">Ajustar Stock</button>
          </div>
        </td>
      `;
    }

    tbody.appendChild(tr);
  });

  stockSummaryText.textContent = `Mostrando ${filteredStock.length} artículos en stock`;
}

  // 5. Diálogos de Confirmación
  function abrirModalConfirm(titulo, mensaje, onConfirm) {
    modalConfirmTitle.textContent = titulo;
    modalConfirmMsg.textContent = mensaje;
    onConfirmCallback = onConfirm;
    modalConfirm.hidden = false;
  }

  function cerrarModalConfirm() {
    modalConfirm.hidden = true;
    onConfirmCallback = null;
  }

  btnConfirmCancel.addEventListener('click', cerrarModalConfirm);
  btnConfirmAccept.addEventListener('click', async () => {
    if (onConfirmCallback) await onConfirmCallback();
    cerrarModalConfirm();
  });

  // 6. Acciones Globales
  window.__adminStock = {
    toggleDropdown: (id) => {
      document.querySelectorAll('.row-dropdown-menu').forEach(el => {
        if (el.id !== `dropdown-${id}`) el.hidden = true;
      });
      const target = document.getElementById(`dropdown-${id}`);
      if (target) target.hidden = !target.hidden;
    },

    iniciarEdicion: (id) => {
      currentEditingId = id;
      renderizarTabla();
      const inputCant = document.getElementById(`edit-cant-${id}`);
      if (inputCant) {
        inputCant.focus();
        inputCant.select();
      }
    },

    cancelarEdicion: () => {
      currentEditingId = null;
      renderizarTabla();
    },

    solicitarGuardado: (id) => {
      const stockItem = rawStockList.find(s => s.id === id);
      if (!stockItem) return;

      const nuevaCantidad = parseInt(document.getElementById(`edit-cant-${id}`).value, 10);
      const nuevoMinimo = parseInt(document.getElementById(`edit-min-${id}`).value, 10);

      if (isNaN(nuevaCantidad) || isNaN(nuevoMinimo) || nuevaCantidad < 0 || nuevoMinimo < 0) {
        alert('Por favor ingrese valores numéricos válidos mayores o iguales a 0.');
        return;
      }

      const prod = productosList.find(p => p.id === stockItem.producto_id);
      const nombreProd = stockItem.producto_nombre || prod?.descripcion || `Producto #${stockItem.producto_id}`;

      abrirModalConfirm(
        'Modificar Inventario',
        `¿Desea confirmar el ajuste para "${nombreProd}"? Existencias: ${nuevaCantidad} unid. (Mínimo: ${nuevoMinimo})`,
        async () => {
          try {
            const res = await fetch(`/api/v1/stock_sucursal/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                cantidad_disponible: Number(nuevaCantidad.toFixed(1)),
                stock_minimo: Number(nuevoMinimo.toFixed(1))
              })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al actualizar el stock');
            }

            currentEditingId = null;
            await cargarStockSegunFiltro();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Ocultar dropdowns
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 7. Buscador reactivo y compatibilidad con escáner de código de barras
  inputSearch.addEventListener('input', (e) => {
    searchTerm = e.target.value.trim();
    renderizarTabla();
  });

  inputSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Si el lector disparó el código, el input ya se filtró
      inputSearch.select();
    }
  });

  // Logout con /api/v1/auth/logout
  btnLogout.addEventListener('click', async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.replace('index.html');
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Inicialización secuencial
  async function iniciarModulo() {
    await verificarSesion();
    await cargarCatalogosBase();
    await cargarStockSegunFiltro();
  }

  iniciarModulo();
});