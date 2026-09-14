document.addEventListener('DOMContentLoaded', () => {
  let sucursalesList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // Cache de elementos DOM
  const tbody = document.getElementById('sucursales-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddSucursal = document.getElementById('btn-add-sucursal');

  // Modal Crear
  const modalCreate = document.getElementById('modal-create-sucursal');
  const formCreate = document.getElementById('form-create-sucursal');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');

  // Modal Transferencia Forzosa de Depósito Central
  const modalTransfer = document.getElementById('modal-transfer-deposito');
  const selectNuevoDeposito = document.getElementById('select-nuevo-deposito');
  const btnCancelTransfer = document.getElementById('btn-cancel-transfer');
  const btnConfirmTransfer = document.getElementById('btn-confirm-transfer');

  // Modal de Confirmación Estándar
  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  // 1. Verificación de sesión
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

  // 2. Carga de Sucursales
  async function cargarSucursales() {
    try {
      const res = await fetch('/api/v1/sucursales', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron obtener las sucursales');
      sucursalesList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar sucursales de la base de datos.</td></tr>`;
    }
  }

  // 3. Renderizado de Grilla
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (sucursalesList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem;">No hay sucursales registradas.</td></tr>`;
      return;
    }

    sucursalesList.forEach(s => {
      const tr = document.createElement('tr');
      tr.dataset.id = s.id;

      if (currentEditingId === s.id) {
        // Modo Edición Inline
        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${s.id}</td>
          <td><input type="text" class="table-input" id="edit-nombre-${s.id}" value="${escapeHtml(s.nombre || '')}" required></td>
          <td><input type="text" class="table-input" id="edit-direccion-${s.id}" value="${escapeHtml(s.direccion || '')}" required></td>
          <td style="text-align:center;">
            <input type="number" class="table-input" style="width: 80px; text-align: center;" id="edit-pto-${s.id}" value="${s.punto_de_venta_arca}" min="1" required>
          </td>
          <td style="text-align:center;">
            <input type="checkbox" class="checkbox-edit" id="edit-deposito-${s.id}" ${s.es_deposito_central ? 'checked' : ''}>
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminSucursales.solicitarGuardado(${s.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminSucursales.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;
      } else {
        // Modo Lectura
        const circleClass = s.es_deposito_central ? 'status-active' : 'status-inactive';
        tr.innerHTML = `
          <td>${s.id}</td>
          <td><strong>${escapeHtml(s.nombre)}</strong></td>
          <td>${escapeHtml(s.direccion)}</td>
          <td style="text-align:center; font-family: monospace; font-weight: 600;">${String(s.punto_de_venta_arca).padStart(4, '0')}</td>
          <td style="text-align:center;">
            <span class="status-indicator ${circleClass}" title="${s.es_deposito_central ? 'Depósito Central' : 'Sucursal Minorista'}"></span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminSucursales.toggleDropdown(${s.id})">&#8942;</button>
            <div id="dropdown-${s.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminSucursales.iniciarEdicion(${s.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminSucursales.solicitarEliminacion(${s.id})">Eliminar</button>
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
  window.__adminSucursales = {
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
      const sucursalActual = sucursalesList.find(s => s.id === id);
      if (!sucursalActual) return;

      const nuevoNombre = document.getElementById(`edit-nombre-${id}`).value.trim();
      const nuevaDireccion = document.getElementById(`edit-direccion-${id}`).value.trim();
      const nuevoPtoArca = Number(document.getElementById(`edit-pto-${id}`).value);
      const nuevoEsDeposito = document.getElementById(`edit-deposito-${id}`).checked;

      if (!nuevoNombre || !nuevaDireccion || !nuevoPtoArca) {
        alert('Nombre, Dirección y Punto de Venta ARCA son campos requeridos.');
        return;
      }

      const payload = {
        nombre: nuevoNombre,
        direccion: nuevaDireccion,
        punto_de_venta_arca: nuevoPtoArca,
        es_deposito_central: nuevoEsDeposito
      };

      // REGLA: Si era depósito central y se intenta desmarcar
      if (sucursalActual.es_deposito_central && !nuevoEsDeposito) {
        const otrasSucursales = sucursalesList.filter(s => s.id !== id);

        if (otrasSucursales.length === 0) {
          alert('Esta es la única sucursal en el sistema; debe obligatoriamente mantenerse como Depósito Central.');
          document.getElementById(`edit-deposito-${id}`).checked = true;
          return;
        }

        // Llenar selector del modal de transferencia
        selectNuevoDeposito.innerHTML = '';
        otrasSucursales.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.nombre} (Pto. ${s.punto_de_venta_arca})`;
          selectNuevoDeposito.appendChild(opt);
        });

        // Configurar acción de transferencia y desplegar diálogo
        btnConfirmTransfer.onclick = async () => {
          const nuevoDepositoId = Number(selectNuevoDeposito.value);
          modalTransfer.hidden = true;

          try {
            // Guardar sucursal actual en false y designar la otra en true en el backend
            payload.nuevo_deposito_central_id = nuevoDepositoId;

            const res = await fetch(`/api/v1/sucursales/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al reasignar depósito');
            }

            currentEditingId = null;
            await cargarSucursales();
          } catch (err) {
            alert(err.message);
          }
        };

        modalTransfer.hidden = false;
        return;
      }

      // Guardado regular
      abrirModalConfirm(
        'Modificar Sucursal',
        `¿Desea confirmar las modificaciones para la sucursal "${nuevoNombre}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/sucursales/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al actualizar sucursal');
            }

            currentEditingId = null;
            await cargarSucursales();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarEliminacion: (id) => {
      const sucursal = sucursalesList.find(s => s.id === id);
      if (!sucursal) return;

      if (sucursal.es_deposito_central) {
        alert('No se puede eliminar la sucursal que actúa como Depósito Central. Primero reasigna este rol a otra sucursal.');
        return;
      }

      abrirModalConfirm(
        'Eliminar Sucursal',
        `¿Realmente desea eliminar la sucursal "${sucursal.nombre}"?\nEsta acción no se puede deshacer si tiene ventas o turnos registrados.`,
        async () => {
          try {
            const res = await fetch(`/api/v1/sucursales/${id}`, {
              method: 'DELETE',
              credentials: 'include'
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'No se pudo eliminar la sucursal');
            }

            await cargarSucursales();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  btnCancelTransfer.addEventListener('click', () => {
    modalTransfer.hidden = true;
  });

  // Ocultar dropdown al clickear fuera
  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 6. Modal Crear Sucursal
  btnAddSucursal.addEventListener('click', () => {
    formCreate.reset();
    // Si no hay ninguna sucursal aún, forzar a que la primera sea depósito central
    if (sucursalesList.length === 0) {
      const checkDep = document.getElementById('create-es-deposito');
      checkDep.checked = true;
      checkDep.disabled = true;
    } else {
      document.getElementById('create-es-deposito').disabled = false;
    }
    modalCreate.hidden = false;
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose.addEventListener('click', cerrarModalCrear);
  btnCancelCreate.addEventListener('click', cerrarModalCrear);

  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(formCreate);
    const payload = {
      nombre: formData.get('nombre').trim(),
      direccion: formData.get('direccion').trim(),
      punto_de_venta_arca: Number(formData.get('punto_de_venta_arca')),
      es_deposito_central: formData.get('es_deposito_central') === 'on'
    };

    try {
      const res = await fetch('/api/v1/sucursales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al registrar la sucursal');
      }

      cerrarModalCrear();
      await cargarSucursales();
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
  cargarSucursales();
});