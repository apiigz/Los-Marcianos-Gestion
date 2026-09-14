document.addEventListener('DOMContentLoaded', () => {
  let productosList = [];
  let categoriasList = [];
  let proveedoresList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // Elementos DOM
  const tbody = document.getElementById('products-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddProduct = document.getElementById('btn-add-product');

  // Modal Crear
  const modalCreate = document.getElementById('modal-create-product');
  const formCreate = document.getElementById('form-create-product');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');
  const inputCodigo = document.getElementById('create-codigo');
  const selectCategoria = document.getElementById('create-categoria');
  const selectProveedor = document.getElementById('create-proveedor');

  // Modal Confirmación
  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  // 1. Verificación de sesión de Administrador
  async function verificarSesion() {
    try {
      const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();

      if (data.user?.rol !== 'ADMINISTRADOR') {
        alert('Acceso restringido a administradores.');
        window.location.replace('index.html');
        return;
      }

      userDisplay.textContent = `${data.user.nombre} ${data.user.apellido}`;
    } catch {
      window.location.replace('index.html');
    }
  }

  // 2. Carga de datos auxiliares (Categorías y Proveedores)
  async function cargarAuxiliares() {
    try {
      const [resCat, resProv] = await Promise.all([
        fetch('/api/v1/categorias', { credentials: 'include' }),
        fetch('/api/v1/proveedores', { credentials: 'include' })
      ]);

      if (resCat.ok) categoriasList = await resCat.json();
      if (resProv.ok) proveedoresList = await resProv.json();

      poblarSelectsCrear();
    } catch (e) {
      console.warn('Error al cargar listas auxiliares:', e);
    }
  }

  function poblarSelectsCrear() {
    selectCategoria.innerHTML = '<option value="">Seleccionar categoría...</option>';
    categoriasList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      selectCategoria.appendChild(opt);
    });

    selectProveedor.innerHTML = '<option value="">Seleccionar proveedor...</option>';
    proveedoresList.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nombre || p.razon_social;
      selectProveedor.appendChild(opt);
    });
  }

  // 3. Carga de catálogo de productos
  async function cargarProductos() {
    try {
      const res = await fetch('/api/v1/productos', { credentials: 'include' });
      if (!res.ok) throw new Error('Error al listar productos');
      productosList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar productos de la base de datos.</td></tr>`;
    }
  }

  // 4. Renderizado de la tabla con modo Lectura y Edición Inline
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (productosList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem;">No hay productos registrados en el catálogo.</td></tr>`;
      return;
    }

    productosList.forEach(p => {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;

      if (currentEditingId === p.id) {
        // --- FILA EN MODO EDICIÓN INLINE ---
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td><input type="text" class="table-input" id="edit-codigo-${p.id}" value="${escapeHtml(p.codigo_barra || '')}" required></td>
          <td><input type="text" class="table-input" id="edit-descripcion-${p.id}" value="${escapeHtml(p.descripcion || '')}" required></td>
          <td>
            <select class="table-input" id="edit-categoria-${p.id}">
              ${categoriasList.map(c => `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
            </select>
          </td>
          <td>
            <select class="table-input" id="edit-proveedor-${p.id}">
              ${proveedoresList.map(pr => `<option value="${pr.id}" ${pr.id === p.proveedor_id ? 'selected' : ''}>${escapeHtml(pr.nombre || pr.razon_social)}</option>`).join('')}
            </select>
          </td>
          <td><input type="number" step="0.01" class="table-input" style="text-align:right;" id="edit-costo-${p.id}" value="${p.precio_costo || 0}"></td>
          <td><input type="number" step="0.01" class="table-input" style="text-align:right;" id="edit-minorista-${p.id}" value="${p.precio_minorista || 0}" required></td>
          <td><input type="number" step="0.01" class="table-input" style="text-align:right;" id="edit-mayorista-${p.id}" value="${p.precio_mayorista || 0}"></td>
          <td>
            <select class="table-input" id="edit-iva-${p.id}">
              <option value="21.00" ${Number(p.alicuota_iva) === 21 ? 'selected' : ''}>21%</option>
              <option value="10.50" ${Number(p.alicuota_iva) === 10.5 ? 'selected' : ''}>10.5%</option>
              <option value="0.00" ${Number(p.alicuota_iva) === 0 ? 'selected' : ''}>0%</option>
              <option value="27.00" ${Number(p.alicuota_iva) === 27 ? 'selected' : ''}>27%</option>
            </select>
          </td>
          <td style="text-align:center;">
            <input type="checkbox" class="checkbox-edit" id="edit-activo-${p.id}" ${p.activo ? 'checked' : ''}>
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminProductos.solicitarGuardado(${p.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminProductos.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;
      } else {
        // --- FILA EN MODO LECTURA ---
        const catNombre = p.categoria_nombre || categoriasList.find(c => c.id === p.categoria_id)?.nombre || '-';
        const provNombre = p.proveedor_nombre || proveedoresList.find(pr => pr.id === p.proveedor_id)?.nombre || proveedoresList.find(pr => pr.id === p.proveedor_id)?.razon_social || '-';
        const circleClass = p.activo ? 'status-active' : 'status-inactive';

        tr.innerHTML = `
          <td>${p.id}</td>
          <td style="font-family: monospace; font-weight: 600;">${escapeHtml(p.codigo_barra || '')}</td>
          <td><strong>${escapeHtml(p.descripcion || '')}</strong></td>
          <td>${escapeHtml(catNombre)}</td>
          <td>${escapeHtml(provNombre)}</td>
          <td style="text-align:right;">$ ${formatNumber(p.precio_costo)}</td>
          <td style="text-align:right; font-weight:600; color:#0284c7;">$ ${formatNumber(p.precio_minorista)}</td>
          <td style="text-align:right;">$ ${formatNumber(p.precio_mayorista)}</td>
          <td style="text-align:center;">${Number(p.alicuota_iva).toFixed(1)}%</td>
          <td style="text-align:center;">
            <span class="status-indicator ${circleClass}" title="${p.activo ? 'Activo para la venta' : 'Inactivo'}"></span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminProductos.toggleDropdown(${p.id})">&#8942;</button>
            <div id="dropdown-${p.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminProductos.iniciarEdicion(${p.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminProductos.solicitarBaja(${p.id})">${p.activo ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 5. Modales de Confirmación
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

  // 6. Métodos Globales del Módulo
  window.__adminProductos = {
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
    },

    cancelarEdicion: () => {
      currentEditingId = null;
      renderizarTabla();
    },

    solicitarGuardado: (id) => {
      const codigo = document.getElementById(`edit-codigo-${id}`).value.trim();
      const descripcion = document.getElementById(`edit-descripcion-${id}`).value.trim();
      const precioMinorista = parseFloat(document.getElementById(`edit-minorista-${id}`).value);

      if (!codigo || !descripcion || isNaN(precioMinorista)) {
        alert('Código de barra, descripción y precio minorista son requeridos.');
        return;
      }

      const payload = {
        codigo_barra: codigo,
        descripcion: descripcion,
        categoria_id: Number(document.getElementById(`edit-categoria-${id}`).value),
        proveedor_id: Number(document.getElementById(`edit-proveedor-${id}`).value),
        precio_costo: parseFloat(document.getElementById(`edit-costo-${id}`).value) || 0,
        precio_minorista: precioMinorista,
        precio_mayorista: parseFloat(document.getElementById(`edit-mayorista-${id}`).value) || 0,
        alicuota_iva: parseFloat(document.getElementById(`edit-iva-${id}`).value),
        activo: document.getElementById(`edit-activo-${id}`).checked
      };

      abrirModalConfirm(
        'Modificar Producto',
        `¿Confirmar los cambios para "${descripcion}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/productos/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || err.message || 'Error al actualizar producto');
            }

            currentEditingId = null;
            await cargarProductos();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarBaja: (id) => {
      const p = productosList.find(item => item.id === id);
      if (!p) return;

      const nuevoEstado = !p.activo;
      const accion = nuevoEstado ? 'reactivar para la venta' : 'desactivar (borrado lógico)';

      abrirModalConfirm(
        'Cambiar estado del producto',
        `¿Desea ${accion} el producto "${p.descripcion}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/productos/${id}/estado`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ activo: nuevoEstado })
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.error || err.message || 'Error al alterar estado del producto');
            }

            await cargarProductos();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Ocultar dropdown al cliquear afuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 7. Modal Crear Producto & Manejo del Lector de Código de Barras
  btnAddProduct.addEventListener('click', () => {
    formCreate.reset();
    document.getElementById('create-iva').value = "21.00";
    modalCreate.hidden = false;
    // Foco inmediato al input para recibir el disparo del láser de entrada
    setTimeout(() => inputCodigo.focus(), 50);
  });

  // UX Escáner: evitar que el 'Enter' del lector haga submit precipitado del form
  inputCodigo.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('create-descripcion').focus();
    }
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose.addEventListener('click', cerrarModalCrear);
  btnCancelCreate.addEventListener('click', cerrarModalCrear);

  // Envío del nuevo producto
  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(formCreate);
    const payload = {
      codigo_barra: formData.get('codigo_barra').trim(),
      descripcion: formData.get('descripcion').trim(),
      categoria_id: Number(formData.get('categoria_id')),
      proveedor_id: Number(formData.get('proveedor_id')),
      precio_costo: parseFloat(formData.get('precio_costo')) || 0,
      precio_minorista: parseFloat(formData.get('precio_minorista')),
      precio_mayorista: parseFloat(formData.get('precio_mayorista')) || 0,
      alicuota_iva: parseFloat(formData.get('alicuota_iva')),
      activo: formData.get('activo') === 'on'
    };

    try {
      const res = await fetch('/api/v1/productos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Error al crear el producto');
      }

      cerrarModalCrear();
      await cargarProductos();
    } catch (err) {
      alert(err.message);
    }
  });

  // Logout
  btnLogout.addEventListener('click', async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.replace('index.html');
  });

  function formatNumber(num) {
    return Number(num || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function iniciarModulo() {
        await verificarSesion();
        await cargarAuxiliares(); 
        await cargarProductos();  
    }

    iniciarModulo();
});