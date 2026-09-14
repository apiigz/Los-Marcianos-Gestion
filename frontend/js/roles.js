document.addEventListener('DOMContentLoaded', () => {
  let rolesList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // DOM Elements
  const tbody = document.getElementById('roles-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddRole = document.getElementById('btn-add-role');

  // Modales
  const modalCreate = document.getElementById('modal-create-role');
  const formCreate = document.getElementById('form-create-role');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');

  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  // 1. Validar sesión de administrador
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

  // 2. Cargar listado de roles
  async function cargarRoles() {
    try {
      const res = await fetch('/api/v1/roles', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo obtener la lista de roles');
      rolesList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar roles desde la base de datos.</td></tr>`;
    }
  }

  // 3. Renderizado de grilla (Lectura e Inline Editing)
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (rolesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 2rem;">No hay roles creados.</td></tr>`;
      return;
    }

    rolesList.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;

      if (currentEditingId === r.id) {
        // Modo Edición Inline
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${r.id}</td>
          <td>
            <input 
              type="text" 
              class="table-input" 
              id="edit-nombre-${r.id}" 
              value="${escapeHtml(r.nombre)}" 
              maxlength="40"
              autocomplete="off"
            >
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminRoles.solicitarGuardado(${r.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminRoles.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;
      } else {
        // Modo Lectura
        tr.innerHTML = `
          <td>${r.id}</td>
          <td><strong>${escapeHtml(r.nombre)}</strong></td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminRoles.toggleDropdown(${r.id})">&#8942;</button>
            <div id="dropdown-${r.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminRoles.iniciarEdicion(${r.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminRoles.solicitarEliminacion(${r.id})">Eliminar</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 4. Modales de confirmación
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

  // 5. Métodos globales del módulo
  window.__adminRoles = {
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
      const input = document.getElementById(`edit-nombre-${id}`);
      const nuevoNombre = input.value.trim().toUpperCase();

      if (!nuevoNombre) {
        alert('El nombre del rol no puede quedar vacío.');
        input.focus();
        return;
      }

      abrirModalConfirm(
        'Modificar Rol',
        `¿Desea cambiar el nombre del rol a "${nuevoNombre}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/roles/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ nombre: nuevoNombre })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al modificar rol');
            }

            currentEditingId = null;
            await cargarRoles();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarEliminacion: (id) => {
      const rol = rolesList.find(r => r.id === id);
      if (!rol) return;

      // UX Guard: No permitir borrar el rol básico ADMINISTRADOR
      if (rol.nombre === 'ADMINISTRADOR') {
        alert('El rol ADMINISTRADOR es vital para el sistema y no puede eliminarse.');
        return;
      }

      abrirModalConfirm(
        'Eliminar Rol',
        `¿Realmente desea eliminar el rol "${rol.nombre}"?\n(Asegúrese de que no haya usuarios asignados a este rol).`,
        async () => {
          try {
            const res = await fetch(`/api/v1/roles/${id}`, {
              method: 'DELETE',
              credentials: 'include'
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'No se pudo eliminar el rol.');
            }

            await cargarRoles();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Cerrar dropdown al hacer clic fuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 6. Modal Crear Rol
  btnAddRole.addEventListener('click', () => {
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
    const input = document.getElementById('create-nombre');
    const nombre = input.value.trim().toUpperCase();

    if (!nombre) {
      alert('Debe ingresar un nombre para el rol.');
      return;
    }

    try {
      const res = await fetch('/api/v1/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ nombre })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al crear el rol');
      }

      cerrarModalCrear();
      await cargarRoles();
    } catch (err) {
      alert(err.message);
    }
  });

  // Logout
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

  // Inicio
  verificarSesion();
  cargarRoles();
});