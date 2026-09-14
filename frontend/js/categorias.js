document.addEventListener('DOMContentLoaded', () => {
  let categoriasList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // DOM Elements
  const tbody = document.getElementById('categorias-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddCategoria = document.getElementById('btn-add-categoria');

  // Modal Crear
  const modalCreate = document.getElementById('modal-create-categoria');
  const formCreate = document.getElementById('form-create-categoria');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');
  const modalConfirmTitle = document.getElementById('modal-confirm-title')
  const modalConfirmMsg = document.getElementById('modal-confirm-message')
  const modalConfirm = document.getElementById('modal-confirm')

  const btnConfirmCancel = document.getElementById('btn-confirm-cancel')
  const btnConfirmAccept = document.getElementById('btn-confirm-accept')
  // 1. Validar sesión con /api/v1/auth/me
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

  // 2. Cargar listado de categorías
  async function cargarCategorias() {
    try {
      const res = await fetch('/api/v1/categorias', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo obtener la lista de categorías');
      categoriasList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar categorías desde la base de datos.</td></tr>`;
    }
  }

  // 3. Renderizado de la grilla
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (categoriasList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem;">No hay categorías registradas.</td></tr>`;
      return;
    }

    categoriasList.forEach(c => {
      const tr = document.createElement('tr');
      tr.dataset.id = c.id;

      const unidadVal = (c.unidad_medida || 'UNIDAD').toUpperCase();

      if (currentEditingId === c.id) {
        // Modo Edición Inline (permite editar tanto nombre como unidad de medida)
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${c.id}</td>
          <td>
            <input 
              type="text" 
              class="table-input" 
              id="edit-nombre-${c.id}" 
              value="${escapeHtml(c.nombre)}" 
              maxlength="50"
              autocomplete="off"
            >
          </td>
          <td>
            <select id="edit-unidad-${c.id}" class="table-input" style="padding: 0.25rem;">
              <option value="UNIDAD" ${unidadVal === 'UNIDAD' ? 'selected' : ''}>UNIDAD</option>
              <option value="KILO" ${unidadVal === 'KILO' ? 'selected' : ''}>KILO</option>
            </select>
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminCategorias.solicitarGuardado(${c.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminCategorias.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;
      } else {
        // Modo Lectura
        const badgeEstilo = unidadVal === 'KILO' 
          ? 'background-color: #fef3c7; color: #b45309; border: 1px solid #fcd34d;' 
          : 'background-color: #f1f5f9; color: #475569; border: 1px solid #cbd5e1;';

        tr.innerHTML = `
          <td>${c.id}</td>
          <td><strong>${escapeHtml(c.nombre)}</strong></td>
          <td>
            <span style="display:inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600; ${badgeEstilo}">
              ${unidadVal === 'KILO' ? 'Por Kilo (kg)' : 'Por Unidad (u.)'}
            </span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminCategorias.toggleDropdown(${c.id})">&#8942;</button>
            <div id="dropdown-${c.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminCategorias.iniciarEdicion(${c.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminCategorias.solicitarEliminacion(${c.id})">Eliminar</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 4. Diálogos de Confirmación
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

  // 5. Controlador de Acciones
  window.__adminCategorias = {
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
      const input = document.getElementById(`edit-nombre-${id}`);
      if (input) {
        input.focus();
        input.select();
      }
    },

    cancelarEdicion: () => {
      currentEditingId = null;
      renderizarTabla();
    },

    solicitarGuardado: (id) => {
      const inputNombre = document.getElementById(`edit-nombre-${id}`);
      const selectUnidad = document.getElementById(`edit-unidad-${id}`);

      const nuevoNombre = inputNombre.value.trim();
      const nuevaUnidad = selectUnidad ? selectUnidad.value : 'UNIDAD';

      if (!nuevoNombre) {
        alert('El nombre de la categoría no puede quedar vacío.');
        inputNombre.focus();
        return;
      }

      abrirModalConfirm(
        'Modificar Categoría',
        `¿Desea guardar los cambios para esta categoría?\nNombre: "${nuevoNombre}"\nUnidad: ${nuevaUnidad}`,
        async () => {
          try {
            const res = await fetch(`/api/v1/categorias/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ 
                nombre: nuevoNombre,
                unidad_medida: nuevaUnidad
              })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al actualizar la categoría');
            }

            currentEditingId = null;
            await cargarCategorias();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarEliminacion: (id) => {
      const cat = categoriasList.find(c => c.id === id);
      if (!cat) return;

      abrirModalConfirm(
        'Eliminar Categoría',
        `¿Realmente desea eliminar la categoría "${cat.nombre}"?\nEsta acción fallará si existen productos asociados a esta categoría.`,
        async () => {
          try {
            const res = await fetch(`/api/v1/categorias/${id}`, {
              method: 'DELETE',
              credentials: 'include'
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'No se pudo eliminar la categoría');
            }

            await cargarCategorias();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Ocultar dropdowns al cliquear afuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 6. Modal Crear Categoría
  btnAddCategoria.addEventListener('click', () => {
    formCreate.reset();
    modalCreate.hidden = false;
    document.getElementById('create-nombre').focus();
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose.addEventListener('click', cerrarModalCrear);
  btnCancelCreate.addEventListener('click', cerrarModalCrear);

  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputNombre = document.getElementById('create-nombre');
    const selectUnidad = document.getElementById('create-unidad-medida');

    const nombre = inputNombre.value.trim();
    const unidad_medida = selectUnidad ? selectUnidad.value : 'UNIDAD';

    if (!nombre) {
      alert('Debe ingresar un nombre para la categoría.');
      return;
    }

    try {
      const res = await fetch('/api/v1/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          nombre,
          unidad_medida
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al registrar la categoría');
      }

      cerrarModalCrear();
      await cargarCategorias();
    } catch (err) {
      alert(err.message);
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
    await cargarCategorias();
  }

  iniciarModulo();
});