document.addEventListener('DOMContentLoaded', () => {
  let proveedoresList = [];
  let currentEditingId = null;
  let onConfirmCallback = null;

  // DOM Elements
  const tbody = document.getElementById('proveedores-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const btnAddProveedor = document.getElementById('btn-add-proveedor');

  // Modal Crear
  const modalCreate = document.getElementById('modal-create-proveedor');
  const formCreate = document.getElementById('form-create-proveedor');
  const btnModalCreateClose = document.getElementById('btn-modal-create-close');
  const btnCancelCreate = document.getElementById('btn-cancel-create');

  // Inputs CUIT Modal Crear
  const cuitPre = document.getElementById('create-cuit-prefijo');
  const cuitMed = document.getElementById('create-cuit-medio');
  const cuitSuf = document.getElementById('create-cuit-sufijo');

  // Modal Confirmación
  const modalConfirm = document.getElementById('modal-confirm');
  const modalConfirmTitle = document.getElementById('modal-confirm-title');
  const modalConfirmMsg = document.getElementById('modal-confirm-message');
  const btnConfirmAccept = document.getElementById('btn-confirm-accept');
  const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

  // Funciones de ayuda para CUIT
  function formatearCuitVisual(cuitRaw) {
    if (!cuitRaw) return '-';
    const soloNumeros = String(cuitRaw).replace(/\D/g, '');
    if (soloNumeros.length === 11) {
      return `${soloNumeros.slice(0, 2)}-${soloNumeros.slice(2, 10)}-${soloNumeros.slice(10)}`;
    }
    return cuitRaw;
  }

  function desglosarCuit(cuitRaw) {
    const limpios = String(cuitRaw || '').replace(/\D/g, '');
    return {
      prefijo: limpios.slice(0, 2),
      medio: limpios.slice(2, 10),
      sufijo: limpios.slice(10, 11)
    };
  }

  function enlazarAutoSalto(inputActual, inputSiguiente, maxLen) {
    inputActual.addEventListener('input', (e) => {
      // Filtrar no numéricos
      inputActual.value = inputActual.value.replace(/\D/g, '');
      if (inputActual.value.length >= maxLen && inputSiguiente) {
        inputSiguiente.focus();
        inputSiguiente.select();
      }
    });
  }

  // Configurar autosalto en el modal de creación
  enlazarAutoSalto(cuitPre, cuitMed, 2);
  enlazarAutoSalto(cuitMed, cuitSuf, 8);
  cuitSuf.addEventListener('input', () => {
    cuitSuf.value = cuitSuf.value.replace(/\D/g, '');
  });

  // 1. Sesión
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

  // 2. Cargar proveedores
  async function cargarProveedores() {
    try {
      const res = await fetch('/api/v1/proveedores', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo obtener la lista de proveedores');
      proveedoresList = await res.json();
      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar proveedores desde la base de datos.</td></tr>`;
    }
  }

  // 3. Renderizado de Grilla
  function renderizarTabla() {
    tbody.innerHTML = '';

    if (proveedoresList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;">No hay proveedores registrados.</td></tr>`;
      return;
    }

    proveedoresList.forEach(p => {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;

      if (currentEditingId === p.id) {
        // Modo Edición Inline con 3 bloques para el CUIT
        const cuitPartes = desglosarCuit(p.cuit);

        tr.classList.add('editing-row');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td><input type="text" class="table-input" id="edit-razon-${p.id}" value="${escapeHtml(p.razon_social || '')}" required></td>
          <td>
            <div class="cuit-inline-container">
              <input type="text" class="table-input cuit-box cuit-sm" id="edit-cuit-pre-${p.id}" value="${cuitPartes.prefijo}" maxlength="2">
              <span class="cuit-divider">-</span>
              <input type="text" class="table-input cuit-box cuit-md" id="edit-cuit-med-${p.id}" value="${cuitPartes.medio}" maxlength="8">
              <span class="cuit-divider">-</span>
              <input type="text" class="table-input cuit-box cuit-xs" id="edit-cuit-suf-${p.id}" value="${cuitPartes.sufijo}" maxlength="1">
            </div>
          </td>
          <td><input type="text" class="table-input" id="edit-telefono-${p.id}" value="${escapeHtml(p.telefono || '')}"></td>
          <td><input type="text" class="table-input" id="edit-contacto-${p.id}" value="${escapeHtml(p.contacto_nombre || '')}"></td>
          <td style="text-align:center;">
            <input type="checkbox" class="checkbox-edit" id="edit-activo-${p.id}" ${p.activo ? 'checked' : ''}>
          </td>
          <td class="row-actions-cell">
            <div class="inline-actions-container">
              <button type="button" class="btn-inline-accept" onclick="window.__adminProveedores.solicitarGuardado(${p.id})">Aceptar</button>
              <button type="button" class="btn-inline-cancel" onclick="window.__adminProveedores.cancelarEdicion()">Cancelar</button>
            </div>
          </td>
        `;

        // Añadir auto-salto a los 3 inputs inline recién creados
        setTimeout(() => {
          const inPre = document.getElementById(`edit-cuit-pre-${p.id}`);
          const inMed = document.getElementById(`edit-cuit-med-${p.id}`);
          const inSuf = document.getElementById(`edit-cuit-suf-${p.id}`);
          if (inPre && inMed && inSuf) {
            enlazarAutoSalto(inPre, inMed, 2);
            enlazarAutoSalto(inMed, inSuf, 8);
            inSuf.addEventListener('input', () => { inSuf.value = inSuf.value.replace(/\D/g, ''); });
          }
        }, 0);

      } else {
        // Modo Lectura: CUIT separado en tres bloques con guiones
        const circleClass = p.activo ? 'status-active' : 'status-inactive';
        tr.innerHTML = `
          <td>${p.id}</td>
          <td><strong>${escapeHtml(p.razon_social || '')}</strong></td>
          <td style="font-family: monospace; font-weight:600; letter-spacing: 0.03em;">${formatearCuitVisual(p.cuit)}</td>
          <td>${escapeHtml(p.telefono || '-')}</td>
          <td>${escapeHtml(p.contacto_nombre || '-')}</td>
          <td style="text-align:center;">
            <span class="status-indicator ${circleClass}" title="${p.activo ? 'Activo' : 'Inactivo'}"></span>
          </td>
          <td class="row-actions-cell">
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__adminProveedores.toggleDropdown(${p.id})">&#8942;</button>
            <div id="dropdown-${p.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__adminProveedores.iniciarEdicion(${p.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__adminProveedores.solicitarBaja(${p.id})">${p.activo ? 'Desactivar' : 'Activar'}</button>
            </div>
          </td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  // 4. Modales
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

  // 5. Acciones globales
  window.__adminProveedores = {
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
      const razonSocial = document.getElementById(`edit-razon-${id}`).value.trim();
      const cuitP1 = document.getElementById(`edit-cuit-pre-${id}`).value.trim();
      const cuitP2 = document.getElementById(`edit-cuit-med-${id}`).value.trim();
      const cuitP3 = document.getElementById(`edit-cuit-suf-${id}`).value.trim();
      
      const cuitUnido = `${cuitP1}${cuitP2}${cuitP3}`; // Se unen sin guiones

      const telefono = document.getElementById(`edit-telefono-${id}`).value.trim();
      const contactoNombre = document.getElementById(`edit-contacto-${id}`).value.trim();
      const activo = document.getElementById(`edit-activo-${id}`).checked;

      if (!razonSocial) {
        alert('La Razón Social es requerida.');
        return;
      }

      if (cuitUnido.length !== 11) {
        alert('El CUIT debe tener exactamente 11 dígitos.');
        return;
      }

      const payload = {
        razon_social: razonSocial,
        cuit: cuitUnido, // Llega todo junto al fetch
        telefono: telefono || null,
        contacto_nombre: contactoNombre || null,
        activo: activo
      };

      abrirModalConfirm(
        'Modificar Proveedor',
        `¿Desea confirmar las modificaciones para "${razonSocial}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/proveedores/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al actualizar proveedor');
            }

            currentEditingId = null;
            await cargarProveedores();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    },

    solicitarBaja: (id) => {
      const p = proveedoresList.find(item => item.id === id);
      if (!p) return;

      const nuevoEstado = !p.activo;
      const accion = nuevoEstado ? 'reactivar' : 'desactivar (borrado lógico)';

      abrirModalConfirm(
        'Cambiar estado del proveedor',
        `¿Desea ${accion} al proveedor "${p.razon_social}"?`,
        async () => {
          try {
            const res = await fetch(`/api/v1/proveedores/${id}/estado`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ activo: nuevoEstado })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al modificar estado');
            }

            await cargarProveedores();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  document.addEventListener('click', () => {
    document.querySelectorAll('.row-dropdown-menu').forEach(el => el.hidden = true);
  });

  // 6. Modal Crear Proveedor
  btnAddProveedor.addEventListener('click', () => {
    formCreate.reset();
    modalCreate.hidden = false;
    document.getElementById('create-razon-social').focus();
  });

  function cerrarModalCrear() {
    modalCreate.hidden = true;
  }

  btnModalCreateClose.addEventListener('click', cerrarModalCrear);
  btnCancelCreate.addEventListener('click', cerrarModalCrear);

  formCreate.addEventListener('submit', async (e) => {
    e.preventDefault();

    const cuitUnido = `${cuitPre.value.trim()}${cuitMed.value.trim()}${cuitSuf.value.trim()}`;

    if (cuitUnido.length !== 11) {
      alert('El CUIT debe completarse con sus 11 dígitos numéricos.');
      cuitPre.focus();
      return;
    }

    const formData = new FormData(formCreate);
    const payload = {
      razon_social: formData.get('razon_social').trim(),
      cuit: cuitUnido, // Se envía unido y limpio
      telefono: formData.get('telefono')?.trim() || null,
      contacto_nombre: formData.get('contacto_nombre')?.trim() || null,
      activo: formData.get('activo') === 'on'
    };

    try {
      const res = await fetch('/api/v1/proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || errData.message || 'Error al registrar el proveedor');
      }

      cerrarModalCrear();
      await cargarProveedores();
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
  async function iniciarModulo() {
    await verificarSesion();
    await cargarProveedores();
  }

  iniciarModulo();
});