document.addEventListener('DOMContentLoaded', () => {
  // Estado global en memoria
  let todosLosProductos = [];
  let categoriasList = [];
  let proveedoresList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // Elementos DOM Principales
  const tbody = document.getElementById('products-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddProduct = document.getElementById('btn-add-product');

  // Elementos DOM Filtros
  const inputSearch = document.getElementById('input-buscar-producto');
  const selectCatFilter = document.getElementById('filtro-categoria');
  const selectProvFilter = document.getElementById('filtro-proveedor');
  const selectOrdenFilter = document.getElementById('filtro-orden');
  const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');

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

      if (userDisplay) {
        userDisplay.textContent = `${data.user.nombre} ${data.user.apellido || ''}`;
      }
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
      poblarFiltrosSelect();
    } catch (e) {
      console.warn('Error al cargar listas auxiliares:', e);
    }
  }

  // Poblar los selects del Modal Crear
  function poblarSelectsCrear() {
    if (selectCategoria) {
      selectCategoria.innerHTML = '<option value="">Seleccionar categoría...</option>';
      categoriasList.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nombre;
        selectCategoria.appendChild(opt);
      });
    }

    if (selectProveedor) {
      selectProveedor.innerHTML = '<option value="">Seleccionar proveedor...</option>';
      proveedoresList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.razon_social || p.nombre;
        selectProveedor.appendChild(opt);
      });
    }
  }

  // Poblar los selects de la barra superior de Filtros
  function poblarFiltrosSelect() {
    if (selectCatFilter) {
      selectCatFilter.innerHTML = '<option value="ALL">Todas las categorías</option>';
      categoriasList.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nombre;
        selectCatFilter.appendChild(opt);
      });
    }

    if (selectProvFilter) {
      selectProvFilter.innerHTML = '<option value="ALL">Todos los proveedores</option>';
      proveedoresList.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.razon_social || p.nombre;
        selectProvFilter.appendChild(opt);
      });
    }
  }

  // 3. Carga de catálogo de productos
  async function cargarProductos() {
    try {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4 text-muted">Cargando catálogo...</td></tr>`;
      }
      const res = await fetch('/api/v1/productos', { credentials: 'include' });
      if (!res.ok) throw new Error('Error al listar productos');
      todosLosProductos = await res.json();
      aplicarFiltrosYRenderizar();
    } catch (err) {
      console.error(err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem; color: #f87171;">Error al cargar productos de la base de datos.</td></tr>`;
      }
    }
  }

  // 4. Lógica reactiva de filtrado y ordenamiento en cliente
  function aplicarFiltrosYRenderizar() {
    const query = (inputSearch?.value || '').toLowerCase().trim();
    const categoriaVal = selectCatFilter?.value || 'ALL';
    const proveedorVal = selectProvFilter?.value || 'ALL';
    const orden = selectOrdenFilter?.value || 'creacion_desc';

    if (!Array.isArray(todosLosProductos)) return;

    // Filtrado
    let filtrados = todosLosProductos.filter(p => {
      const cod = String(p.codigo_barra || '').toLowerCase();
      const desc = String(p.descripcion || '').toLowerCase();
      const matchTexto = !query || cod.includes(query) || desc.includes(query);

      let matchCat = (categoriaVal === 'ALL');
      if (!matchCat) {
        matchCat = String(p.categoria_id) === String(categoriaVal);
      }

      let matchProv = (proveedorVal === 'ALL');
      if (!matchProv) {
        matchProv = String(p.proveedor_id) === String(proveedorVal);
      }

      return matchTexto && matchCat && matchProv;
    });

    // Ordenamiento
    filtrados.sort((a, b) => {
      switch (orden) {
        case 'precio_desc':
          return Number(b.precio_minorista || 0) - Number(a.precio_minorista || 0);
        case 'precio_asc':
          return Number(a.precio_minorista || 0) - Number(b.precio_minorista || 0);
        case 'alfabetico':
          return String(a.descripcion || '').localeCompare(String(b.descripcion || ''));
        case 'creacion_asc':
          return (Number(a.id) || 0) - (Number(b.id) || 0);
        case 'creacion_desc':
        default:
          return (Number(b.id) || 0) - (Number(a.id) || 0);
      }
    });

    renderizarTabla(filtrados);
  }

  // 5. Renderizado de la tabla con los ítems filtrados
  function renderizarTabla(lista) {
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!lista || lista.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem; color: var(--text-muted);">No se encontraron productos con los filtros seleccionados.</td></tr>`;
      return;
    }

    lista.forEach(p => {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;

      if (currentEditingId === p.id) {
        // --- MODO EDICIÓN INLINE ---
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
              ${proveedoresList.map(pr => `<option value="${pr.id}" ${pr.id === p.proveedor_id ? 'selected' : ''}>${escapeHtml(pr.razon_social || pr.nombre)}</option>`).join('')}
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
        // --- MODO LECTURA ---
        const catNombre = p.categoria_nombre || categoriasList.find(c => c.id === p.categoria_id)?.nombre || '-';
        const provNombre = p.proveedor_nombre || proveedoresList.find(pr => pr.id === p.proveedor_id)?.razon_social || proveedoresList.find(pr => pr.id === p.proveedor_id)?.nombre || '-';
        const circleClass = p.activo ? 'status-active' : 'status-inactive';

        tr.innerHTML = `
          <td>${p.id}</td>
          <td style="font-family: ui-monospace; font-weight: 600;">${escapeHtml(p.codigo_barra || '')}</td>
          <td>
            <strong>${escapeHtml(p.descripcion || '')}</strong>
            ${p.es_combo ? '<span style="color:var(--color-purple); font-size:0.7rem; margin-left:4px;">[COMBO]</span>' : ''}
          </td>
          <td>${escapeHtml(catNombre)}</td>
          <td>${escapeHtml(provNombre)}</td>
          <td style="text-align:right; font-family: ui-monospace;">$ ${formatNumber(p.precio_costo)}</td>
          <td style="text-align:right; font-weight:700; color:var(--color-green); font-family: ui-monospace;">$ ${formatNumber(p.precio_minorista)}</td>
          <td style="text-align:right; color:var(--color-edit); font-family: ui-monospace;">$ ${formatNumber(p.precio_mayorista)}</td>
          <td style="text-align:center;">${Number(p.alicuota_iva).toFixed(1)}%</td>
          <td style="text-align:center;">
            <span class="status-indicator ${circleClass}" title="${p.activo ? 'Activo para la venta' : 'Inactivo'}"></span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminProductos.toggleDropdown(${p.id})">&#8942;</button>
            <div id="dropdown-${p.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminProductos.iniciarEdicion(${p.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminProductos.solicitarBaja(${p.id})">${p.activo ? 'Desactivar' : 'Activar'}</button>
              <button type="button" class="menu-item" onclick="abrirModalCombo(${p.id}, '${escapeHtml(p.descripcion)}')">Configurar Combo / Receta</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 6. Listeners de Filtros
  function inicializarEventosFiltros() {
    inputSearch?.addEventListener('input', aplicarFiltrosYRenderizar);
    selectCatFilter?.addEventListener('change', aplicarFiltrosYRenderizar);
    selectProvFilter?.addEventListener('change', aplicarFiltrosYRenderizar);
    selectOrdenFilter?.addEventListener('change', aplicarFiltrosYRenderizar);

    btnLimpiarFiltros?.addEventListener('click', () => {
      if (inputSearch) inputSearch.value = '';
      if (selectCatFilter) selectCatFilter.value = 'ALL';
      if (selectProvFilter) selectProvFilter.value = 'ALL';
      if (selectOrdenFilter) selectOrdenFilter.value = 'creacion_desc';
      aplicarFiltrosYRenderizar();
    });
  }

  // 7. Modales de Confirmación
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

  btnConfirmCancel?.addEventListener('click', cerrarModalConfirm);
  btnConfirmAccept?.addEventListener('click', async () => {
    if (onConfirmCallback) await onConfirmCallback();
    cerrarModalConfirm();
  });

  // 8. Métodos Globales del Módulo
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
      aplicarFiltrosYRenderizar();
    },

    cancelarEdicion: () => {
      currentEditingId = null;
      aplicarFiltrosYRenderizar();
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
      const p = todosLosProductos.find(item => item.id === id);
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

  // Ocultar dropdown al hacer click afuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 9. Modal Crear Producto
  btnAddProduct?.addEventListener('click', () => {
    formCreate.reset();
    document.getElementById('create-iva').value = "21.00";
    modalCreate.hidden = false;
    setTimeout(() => inputCodigo.focus(), 50);
  });

  inputCodigo?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('create-descripcion').focus();
    }
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose?.addEventListener('click', cerrarModalCrear);
  btnCancelCreate?.addEventListener('click', cerrarModalCrear);

  formCreate?.addEventListener('submit', async (e) => {
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
  btnLogout?.addEventListener('click', async () => {
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

  // Inicialización Secuencial
  async function iniciarModulo() {
    await verificarSesion();
    inicializarEventosFiltros();
    await cargarAuxiliares();
    await cargarProductos();
  }

  iniciarModulo();
});

// =======================================================
// LÓGICA DE COMBOS / PROMOS (Global)
// =======================================================
let comboActualId = null;
let componentesTemporales = [];
let debounceCombo = null;

window.abrirModalCombo = async function(productoId, descripcion) {
  comboActualId = productoId;
  const modal = document.getElementById('modal-combo');
  const titulo = document.getElementById('modal-combo-titulo');
  
  if (titulo) titulo.textContent = `Receta de: ${descripcion}`;

  try {
    const res = await fetch(`/api/v1/productos/${productoId}/componentes`, { credentials: 'include' });
    componentesTemporales = res.ok ? await res.json() : [];
  } catch (err) {
    componentesTemporales = [];
  }

  renderizarTablaComponentes();

  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => {
      document.getElementById('input-buscar-ingrediente')?.focus();
    }, 100);
  }
};

window.cerrarModalCombo = function() {
  const modal = document.getElementById('modal-combo');
  if (modal) modal.style.display = 'none';
  comboActualId = null;
  componentesTemporales = [];
};

function renderizarTablaComponentes() {
  const tbody = document.getElementById('tbody-componentes-combo');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (componentesTemporales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 1rem; color: #94a3b8; font-style: italic;">No hay ingredientes asignados. Busque y agregue arriba.</td></tr>`;
    return;
  }

  componentesTemporales.forEach((comp, idx) => {
    const esPesable = (comp.unidad_medida || '').toUpperCase().includes('K');
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid #f1f5f9';

    tr.innerHTML = `
      <td style="padding: 0.5rem 0.75rem; font-weight: 500;">${comp.descripcion}</td>
      <td style="padding: 0.5rem 0.75rem; text-align: center;">
        <input 
          type="number" 
          step="${esPesable ? '0.050' : '1'}"
          min="${esPesable ? '0.001' : '1'}"
          value="${comp.cantidad}" 
          onchange="actualizarCantidadIngrediente(${idx}, this.value)"
          style="width: 70px; text-align: center; padding: 0.25rem; border: 1px solid #cbd5e1; border-radius: 4px; font-weight: bold;"
        />
        <span style="font-size: 0.75rem; color: #64748b; margin-left: 2px;">${esPesable ? 'kg' : 'u.'}</span>
      </td>
      <td style="padding: 0.5rem 0.75rem; text-align: center;">
        <button type="button" onclick="quitarIngrediente(${idx})" style="background: transparent; border: none; color: #ef4444; font-weight: bold; font-size: 1.1rem; cursor: pointer;">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.actualizarCantidadIngrediente = function(idx, val) {
  const num = parseFloat(val);
  if (!isNaN(num) && num > 0) {
    componentesTemporales[idx].cantidad = num;
  }
};

window.quitarIngrediente = function(idx) {
  componentesTemporales.splice(idx, 1);
  renderizarTablaComponentes();
};

const inputBuscarIngrediente = document.getElementById('input-buscar-ingrediente');
const listaSugerencias = document.getElementById('lista-sugerencias-ingredientes');

inputBuscarIngrediente?.addEventListener('input', () => {
  const q = inputBuscarIngrediente.value.trim();
  clearTimeout(debounceCombo);

  if (q.length < 2) {
    if (listaSugerencias) listaSugerencias.style.display = 'none';
    return;
  }

  debounceCombo = setTimeout(async () => {
    try {
      const res = await fetch(`/api/v1/productos/buscar?q=${encodeURIComponent(q)}`);
      const productos = await res.json();

      if (!listaSugerencias) return;
      listaSugerencias.innerHTML = '';

      const filtrados = productos.filter(p => p.id !== comboActualId);

      if (filtrados.length === 0) {
        listaSugerencias.style.display = 'none';
        return;
      }

      filtrados.forEach(p => {
        const li = document.createElement('li');
        li.style.padding = '0.5rem 0.75rem';
        li.style.borderBottom = '1px solid #f1f5f9';
        li.style.cursor = 'pointer';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.fontSize = '0.82rem';

        li.innerHTML = `<span>${p.descripcion}</span> <span style="font-weight: bold; color: #64748b;">$${p.precio_minorista}</span>`;
        
        li.onmouseenter = () => li.style.backgroundColor = '#f8fafc';
        li.onmouseleave = () => li.style.backgroundColor = 'white';

        li.onclick = () => {
          if (!componentesTemporales.some(c => c.producto_ingrediente_id === p.id)) {
            componentesTemporales.push({
              producto_ingrediente_id: p.id,
              descripcion: p.descripcion,
              cantidad: 1,
              unidad_medida: p.unidad_medida || 'UNIDAD'
            });
            renderizarTablaComponentes();
          }
          inputBuscarIngrediente.value = '';
          listaSugerencias.style.display = 'none';
        };

        listaSugerencias.appendChild(li);
      });

      listaSugerencias.style.display = 'block';
    } catch (err) {
      console.error('Error al autocompletar ingrediente:', err);
    }
  }, 200);
});

document.getElementById('btn-guardar-combo')?.addEventListener('click', async () => {
  if (componentesTemporales.length === 0) {
    alert('Debe agregar al menos un producto a la receta.');
    return;
  }

  try {
    const res = await fetch(`/api/v1/productos/${comboActualId}/componentes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        componentes: componentesTemporales.map(c => ({
          producto_ingrediente_id: c.producto_ingrediente_id,
          cantidad: c.cantidad
        }))
      })
    });

    if (!res.ok) throw new Error('Error al guardar la receta');
    alert('¡Receta de combo guardada exitosamente!');
    cerrarModalCombo();
    window.location.reload();
  } catch (err) {
    alert(err.message);
  }
});