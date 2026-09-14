document.addEventListener('DOMContentLoaded', () => {
  // Estado global del módulo
  let usuariosList = [];
  let rolesList = [];
  let currentEditingId = null;
  let currentUser = null;
  let onConfirmCallback = null;

  // Elementos DOM principales
  const tbody = document.getElementById('users-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddUser = document.getElementById('btn-add-user');

  // Modales
  const modalCreate = document.getElementById('modal-create-user');
  const formCreate = document.getElementById('form-create-user');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');
  const btnGenPass = document.getElementById('btn-gen-pass');
  const selectRolCreate = document.getElementById('create-rol');

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

      currentUser = data.user;
      userDisplay.textContent = `${currentUser.nombre} ${currentUser.apellido}`;
    } catch {
      window.location.replace('index.html');
    }
  }

  // 2. Carga de datos base (Roles y Usuarios)
  async function cargarRoles() {
    try {
      const res = await fetch('/api/v1/roles', { credentials: 'include' });
      if (res.ok) {
        rolesList = await res.json();
      } else {
        // Fallback operativo si por alguna razón no hay roles qqqqq
        rolesList = [
          { id: 1, nombre: 'ADMINISTRADOR' },
          { id: 2, nombre: 'CAJERO' },
          { id: 3, nombre: 'ENCARGADO' }
        ];
      }
      poblarSelectRoles();
    } catch (e) {
      console.warn('Usando catálogo estático de roles:', e);
      rolesList = [
        { id: 1, nombre: 'ADMINISTRADOR' },
        { id: 2, nombre: 'CAJERO' }
      ];
      poblarSelectRoles();
    }
  }

  function poblarSelectRoles() {
    selectRolCreate.innerHTML = '<option value="">Seleccione un rol...</option>';
    rolesList.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.nombre;
      selectRolCreate.appendChild(opt);
    });
  }

  async function cargarUsuarios() {
    try {
      const res = await fetch('/api/v1/usuarios', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron obtener los usuarios');
      usuariosList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar usuarios de la base de datos.</td></tr>`;
    }
  }

  // 3. Renderizado de la tabla con modo Lectura y Edición Inline
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (usuariosList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem;">No hay usuarios registrados.</td></tr>`;
      return;
    }

    usuariosList.forEach(u => {
      const tr = document.createElement('tr');
      tr.dataset.id = u.id;

      if (currentEditingId === u.id) {
        // --- FILA EN MODO EDICIÓN INLINE ---
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>
            <select class="table-input" id="edit-rol-${u.id}">
              ${rolesList.map(r => `<option value="${r.id}" ${r.id === u.rol_id ? 'selected' : ''}>${r.nombre}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" class="table-input" id="edit-nombre-${u.id}" value="${escapeHtml(u.nombre || '')}"></td>
          <td><input type="text" class="table-input" id="edit-apellido-${u.id}" value="${escapeHtml(u.apellido || '')}"></td>
          <td><input type="text" class="table-input" id="edit-dni-${u.id}" value="${escapeHtml(u.dni || '')}"></td>
          <td><input type="text" class="table-input" id="edit-cuil-${u.id}" value="${escapeHtml(u.cuil || '')}"></td>
          <td><input type="email" class="table-input" id="edit-email-${u.id}" value="${escapeHtml(u.email || '')}"></td>
          <td><input type="text" class="table-input" id="edit-pass-${u.id}" placeholder="Nueva clave (opcional)"></td>
          <td style="text-align:center;">
            <input type="checkbox" class="checkbox-edit" id="edit-activo-${u.id}" ${u.activo ? 'checked' : ''}>
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" title="Guardar cambios" onclick="window.__adminUsers.solicitarGuardado(${u.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" title="Cancelar" onclick="window.__adminUsers.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;
      } else {
        // --- FILA EN MODO LECTURA ---
        const rolEncontrado = rolesList.find(r=> r.id === u.rol_id);
        const nombreRol = u.rol || rolEncontrado?.nombre || 'SIN ROL';


        const circleClass = u.activo ? 'status-active' : 'status-inactive';
        tr.innerHTML = `
          <td>${u.id}</td>
          <td><strong>${escapeHtml(nombreRol)}</strong></td>
          <td>${escapeHtml(u.nombre || '')}</td>
          <td>${escapeHtml(u.apellido || '')}</td>
          <td>${escapeHtml(u.dni || '')}</td>
          <td>${escapeHtml(u.cuil || '-')}</td>
          <td>${escapeHtml(u.email || '-')}</td>
          <td style="color:#64748b; font-family: monospace;">••••••••</td>
          <td style="text-align:center;">
            <span class="status-indicator ${circleClass}" title="${u.activo ? 'Activo' : 'Inactivo'}"></span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminUsers.toggleDropdown(${u.id})">&#8942;</button>
            <div id="dropdown-${u.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminUsers.iniciarEdicion(${u.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminUsers.solicitarBaja(${u.id})">${u.activo ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 4. Lógica de Modales de Confirmación
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

  // 5. Exposición de funciones de acción en ventana
  window.__adminUsers = {
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
      const payload = {
        rol_id: Number(document.getElementById(`edit-rol-${id}`).value),
        nombre: document.getElementById(`edit-nombre-${id}`).value.trim(),
        apellido: document.getElementById(`edit-apellido-${id}`).value.trim(),
        dni: document.getElementById(`edit-dni-${id}`).value.trim(),
        cuil: document.getElementById(`edit-cuil-${id}`).value.trim() || null,
        email: document.getElementById(`edit-email-${id}`).value.trim() || null,
        activo: document.getElementById(`edit-activo-${id}`).checked
      };

      const nuevaPass = document.getElementById(`edit-pass-${id}`).value.trim();
      if (nuevaPass) {
        payload.password = nuevaPass;
      }

      abrirModalConfirm(
        'Modificar Usuario',
        '¿Está seguro de que desea guardar las modificaciones para este usuario?',
        async () => {
          try {
            const res = await fetch(`/api/v1/usuarios/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              console.log("PAYLOAD ENVIADO:", payload);
              const errData = await res.json().catch(() => ({}));
              console.error("RESPUESTA DETALLADA DEL SERVIDOR:", errData);
              throw new Error(errData.message || errData.error || `Error ${res.status}: Fallo al actualizar`);
            }

            currentEditingId = null;
            await cargarUsuarios();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarBaja: (id) => {
      const targetUser = usuariosList.find(u => u.id === id);
      if (!targetUser) return;

      if (currentUser && currentUser.id === id) {
        alert('Operación no permitida: No puedes desactivar tu propia cuenta administradora.');
        return;
      }

      const nuevoEstado = !targetUser.activo;
      const accion = nuevoEstado ? 'reactivar' : 'desactivar (eliminar lógicamente)';

      abrirModalConfirm(
        'Confirmar estado de usuario',
        `¿Realmente desea ${accion} al usuario ${targetUser.nombre} ${targetUser.apellido}?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/usuarios/${id}/estado`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ activo: nuevoEstado })
            });

            if (!res.ok) throw new Error('Error al cambiar el estado del usuario');
            await cargarUsuarios();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Ocultar dropdowns al hacer clic fuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 6. Modal Crear Usuario
  btnAddUser.addEventListener('click', () => {
    formCreate.reset();
    modalCreate.hidden = false;
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose.addEventListener('click', cerrarModalCrear);
  btnCancelCreate.addEventListener('click', cerrarModalCrear);

  // Generador de clave rápida de 4 dígitos
  btnGenPass.addEventListener('click', () => {
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('create-password').value = randomPin;
  });

  // Envío del formulario de alta
  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(formCreate);
    const payload = {
      rol_id: Number(formData.get('rol_id')),
      dni: formData.get('dni').trim(),
      nombre: formData.get('nombre').trim(),
      apellido: formData.get('apellido').trim(),
      cuil: formData.get('cuil')?.trim() || null,
      email: formData.get('email')?.trim() || null,
      password: formData.get('password').trim(),
      activo: true
    };

    try {
      const res = await fetch('/api/v1/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || errorData.message || 'No se pudo crear el usuario');
      }

      cerrarModalCrear();
      await cargarUsuarios();
      alert(`Usuario creado correctamente.\nContraseña asignada: ${payload.password}\n(Pásasela al empleado para que inicie sesión).`);
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

  // Inicialización
  verificarSesion();
  cargarRoles();
  cargarUsuarios();
});