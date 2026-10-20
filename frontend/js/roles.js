document.addEventListener('DOMContentLoaded', () => {
  let rolesList = [];
  let catalogo = [];          // catálogo de permisos (se carga una sola vez)
  let rolEditando = null;     // rol cuyo modal de permisos está abierto
  let currentEditingId = null;
  let onConfirmCallback = null;

  const NOMBRE_MODULO = {
    general: 'General',
    pos: 'Terminal de ventas',
    turnos: 'Turnos de caja',
    ventas: 'Ventas',
    productos: 'Productos',
    stock: 'Stock',
    admin: 'Administración'
  };

  // DOM
  const tbody = document.getElementById('roles-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddRole = document.getElementById('btn-add-role');

  const modalCreate = document.getElementById('modal-create-role');
  const formCreate = document.getElementById('form-create-role');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');

  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  const modalPermisos = document.getElementById('modal-permisos');
  const permisosBody = document.getElementById('permisos-body');
  const permisosTitulo = document.getElementById('permisos-titulo');

  // ---------- Helpers ----------
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || e.message || 'Error en la solicitud');
    }
    return res.json();
  }

  // ---------- Carga ----------
  async function cargarRoles() {
    try {
      rolesList = await getJson('/api/v1/roles');
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar roles desde la base de datos.</td></tr>`;
    }
  }

  // ---------- Tabla ----------
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (rolesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">No hay roles creados.</td></tr>`;
      return;
    }

    rolesList.forEach(r => {
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;

      if (currentEditingId === r.id) {
        // Modo edición inline (solo el nombre)
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${r.id}</td>
          <td>
            <input type="text" class="table-input" id="edit-nombre-${r.id}"
                   value="${escapeHtml(r.nombre)}" maxlength="40" autocomplete="off">
          </td>
          <td></td>
          <td></td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminRoles.solicitarGuardado(${r.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminRoles.cancelarEdicion()">Cancelar</button>
            </div>
          </td>`;
      } else {
        // Modo lectura
        const permTxt = r.es_admin ? 'Todos' : `${r.permisos} permisos`;
        tr.innerHTML = `
          <td>${r.id}</td>
          <td><strong>${escapeHtml(r.nombre)}</strong>${r.es_sistema ? ' <small class="helper-text">(sistema)</small>' : ''}</td>
          <td style="text-align:center;">${r.usuarios}</td>
          <td style="text-align:center;">${permTxt}</td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminRoles.toggleDropdown(${r.id})">&#8942;</button>
            <div id="dropdown-${r.id}" class="row-dropdown-menu" hidden>
              ${r.es_admin ? '' : `<button type="button" class="menu-item menu-item-edit" onclick="window.__adminRoles.abrirPermisos(${r.id})">Permisos</button>`}
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminRoles.iniciarEdicion(${r.id})">Modificar nombre</button>
              ${r.es_sistema ? '' : `<button type="button" class="menu-item menu-item-delete" onclick="window.__adminRoles.solicitarEliminacion(${r.id})">Eliminar</button>`}
            </div>
          </td>`;
      }

      tbody.appendChild(tr);
    });
  }

  // ---------- Confirmación genérica ----------
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

  // ---------- Modal de permisos ----------
  async function abrirPermisos(id) {
    rolEditando = rolesList.find(r => r.id === id);
    if (!rolEditando) return;

    permisosTitulo.textContent = `Permisos de ${rolEditando.nombre}`;
    permisosBody.innerHTML = '<p class="helper-text">Cargando...</p>';
    modalPermisos.hidden = false;

    try {
      if (!catalogo.length) catalogo = await getJson('/api/v1/roles/catalogo-permisos');
      const { permisos } = await getJson(`/api/v1/roles/${id}/permisos`);
      renderPermisos(new Set(permisos));
    } catch (e) {
      alert(e.message);
      modalPermisos.hidden = true;
    }
  }

  function renderPermisos(seleccion) {
    const grupos = catalogo.reduce((acc, p) => {
      (acc[p.modulo] ||= []).push(p);
      return acc;
    }, {});

    permisosBody.innerHTML = Object.entries(grupos).map(([mod, lista]) => `
      <fieldset class="permisos-grupo" style="margin-bottom:.75rem;">
        <legend>
          <label><input type="checkbox" class="chk-modulo"> ${escapeHtml(NOMBRE_MODULO[mod] || mod)}</label>
        </legend>
        ${lista.map(p => `
          <label class="permiso-item">
            <input type="checkbox" class="chk-permiso" value="${escapeHtml(p.codigo)}" ${seleccion.has(p.codigo) ? 'checked' : ''}>
            <span>${escapeHtml(p.descripcion)}<small>${escapeHtml(p.codigo)}</small></span>
          </label>`).join('')}
      </fieldset>`).join('');

    permisosBody.querySelectorAll('fieldset').forEach(actualizarEstadoModulo);
  }

  function actualizarEstadoModulo(fs) {
    const items = [...fs.querySelectorAll('.chk-permiso')];
    const marcados = items.filter(i => i.checked).length;
    const chk = fs.querySelector('.chk-modulo');
    chk.checked = items.length > 0 && marcados === items.length;
    chk.indeterminate = marcados > 0 && marcados < items.length;
  }

  // Delegación: "marcar todo el módulo" + estado intermedio
  permisosBody.addEventListener('change', (e) => {
    const fs = e.target.closest('fieldset');
    if (!fs) return;
    if (e.target.classList.contains('chk-modulo')) {
      fs.querySelectorAll('.chk-permiso').forEach(i => (i.checked = e.target.checked));
    }
    actualizarEstadoModulo(fs);
  });

  function pedirGuardadoPermisos() {
    if (!rolEditando) return;
    const codigos = [...permisosBody.querySelectorAll('.chk-permiso:checked')].map(c => c.value);
    const rol = rolEditando;

    abrirModalConfirm(
      'Guardar permisos',
      `¿Aplicar ${codigos.length} permisos al rol "${rol.nombre}"? El cambio rige desde la próxima acción de sus usuarios.`,
      async () => {
        try {
          const res = await fetch(`/api/v1/roles/${rol.id}/permisos`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permisos: codigos })
          });
          if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.error || e.message || 'Error al guardar permisos');
          }
          modalPermisos.hidden = true;
          rolEditando = null;
          await cargarRoles();
        } catch (err) {
          alert(err.message);
        }
      }
    );
  }

  document.getElementById('btn-permisos-save').addEventListener('click', pedirGuardadoPermisos);
  ['btn-permisos-close', 'btn-permisos-cancel'].forEach(id =>
    document.getElementById(id).addEventListener('click', () => {
      modalPermisos.hidden = true;
      rolEditando = null;
    })
  );

  // ---------- Acciones de la tabla ----------
  window.__adminRoles = {
    toggleDropdown: (id) => {
      document.querySelectorAll('.row-dropdown-menu').forEach(el => {
        if (el.id !== `dropdown-${id}`) el.hidden = true;
      });
      const target = document.getElementById(`dropdown-${id}`);
      if (target) target.hidden = !target.hidden;
    },

    abrirPermisos,

    iniciarEdicion: (id) => {
      currentEditingId = id;
      renderizarTabla();
      const input = document.getElementById(`edit-nombre-${id}`);
      if (input) { input.focus(); input.select(); }
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
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || e.message || 'Error al modificar rol');
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

      if (rol.es_sistema) {
        alert('Los roles del sistema no se pueden eliminar.');
        return;
      }

      abrirModalConfirm(
        'Eliminar Rol',
        `¿Realmente desea eliminar el rol "${rol.nombre}"?\n(No debe tener usuarios asignados).`,
        async () => {
          try {
            const res = await fetch(`/api/v1/roles/${id}`, {
              method: 'DELETE',
              credentials: 'include'
            });
            if (!res.ok) {
              const e = await res.json().catch(() => ({}));
              throw new Error(e.error || e.message || 'No se pudo eliminar el rol.');
            }
            await cargarRoles();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => (el.hidden = true));
  });

  // ---------- Crear rol ----------
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
    const nombre = document.getElementById('create-nombre').value.trim().toUpperCase();

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
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Error al crear el rol');
      }

      const nuevo = await res.json();
      cerrarModalCrear();
      await cargarRoles();
      abrirPermisos(nuevo.id);   // directo a asignarle permisos
    } catch (err) {
      alert(err.message);
    }
  });

  // ---------- Logout ----------
  btnLogout.addEventListener('click', () => Auth.logout());

  // ---------- Inicio ----------
  async function iniciarModulo() {
    const user = await Auth.init('roles.gestionar|usuarios.gestionar');
    if (!user) return;
    Auth.renderSidebar('roles.html');
    userDisplay.textContent = `${user.nombre} ${user.apellido || ''}`;
    await cargarRoles();
  }

  iniciarModulo();
});