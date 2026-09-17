document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let sucursalesList = [];
  let turnosList = [];
  let turnoSeleccionadoParaArqueo = null;
  let onConfirmCallback = null;

  // Filtros activos
  let filtroSucursal = 'all';
  let filtroFranja = 'ALL';
  let filtroFecha = '';
  let filtroEstado = 'ALL';

  // Elementos DOM
  const tbody = document.getElementById('turnos-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const summaryText = document.getElementById('turnos-summary-text');

  // Controles de filtros
  const selectSucursal = document.getElementById('filter-sucursal');
  const franjaPills = document.getElementById('franja-pills');
  const inputFecha = document.getElementById('filter-fecha');
  const selectEstado = document.getElementById('filter-estado');
  const btnLimpiar = document.getElementById('btn-limpiar-filtros');

  // Modal Arqueo
  const modalArqueo = document.getElementById('modal-declarar-arqueo');
  const formArqueo = document.getElementById('form-declarar-arqueo');
  const btnModalArqueoClose = document.getElementById('btn-modal-arqueo-close');
  const btnCancelArqueo = document.getElementById('btn-cancel-arqueo');
  const modalTurnoId = document.getElementById('modal-arqueo-turno-id');
  const modalCaja = document.getElementById('modal-arqueo-caja');
  const modalEsperado = document.getElementById('modal-arqueo-esperado');
  const inputArqueoReal = document.getElementById('input-arqueo-real');
  const inputArqueoObs = document.getElementById('input-arqueo-observaciones');
  const modalDiferencia = document.getElementById('modal-arqueo-diferencia');

  // Elementos informativos de medios digitales en modal
  const modalDebito = document.getElementById('modal-arqueo-debito');
  const modalCredito = document.getElementById('modal-arqueo-credito');
  const modalQr = document.getElementById('modal-arqueo-qr');

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

  // 2. Cargar datos de sucursales para el filtro
  async function cargarSucursales() {
    try {
      const res = await fetch('/api/v1/sucursales', { credentials: 'include' });
      if (!res.ok) throw new Error();
      sucursalesList = await res.json();

      if (selectSucursal) {
        selectSucursal.innerHTML = '<option value="all">Todas las sucursales</option>';
        sucursalesList.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.nombre;
          opt.dataset.nombre = (s.nombre || '').toLowerCase().trim();
          selectSucursal.appendChild(opt);
        });
      }
    } catch (err) {
      console.warn('Error al cargar sucursales:', err);
    }
  }

  // 3. Cargar turnos desde el backend
  async function cargarTurnos() {
    try {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding: 2rem; color: #a1a1aa;">Cargando turnos de caja...</td></tr>`;
      }
      
      const res = await fetch('/api/v1/turno_caja', { credentials: 'include' });
      if (!res.ok) throw new Error('Error al obtener turnos');
      turnosList = await res.json();

      renderizarTabla();
    } catch (err) {
      console.error(err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding: 2rem; color: #f87171;">Error al cargar turnos desde el servidor.</td></tr>`;
      }
    }
  }

  // 4. Renderizado con filtrado tolerante en cliente
  function renderizarTabla() {
    if (!tbody) return;
    tbody.innerHTML = '';

    // Obtener el nombre de la sucursal seleccionada en el combo si existe
    const optSeleccionada = selectSucursal ? selectSucursal.options[selectSucursal.selectedIndex] : null;
    const nombreSucursalFiltro = optSeleccionada && filtroSucursal !== 'all' 
      ? optSeleccionada.text.toLowerCase().trim() 
      : '';

    const turnosFiltrados = turnosList.filter(t => {
      // Filtrado resiliente de Sucursal
      if (filtroSucursal !== 'all') {
        const tSucId = String(t.sucursal_id || '');
        const tSucNombre = String(t.sucursal_nombre || t.sucursal || '').toLowerCase().trim();
        const coincideId = tSucId && tSucId === String(filtroSucursal);
        const coincideNombre = tSucNombre && (tSucNombre === nombreSucursalFiltro || tSucNombre === String(filtroSucursal).toLowerCase());

        // Si no coincide ni por ID ni por nombre, descartamos
        if (!coincideId && !coincideNombre) return false;
      }

      // Filtro de Franja Horaria
      if (filtroFranja !== 'ALL') {
        const franjaTurno = String(t.nombre_turno || t.franja_horaria || '').toUpperCase().trim();
        if (franjaTurno !== filtroFranja) return false;
      }

      // Filtro de Estado
      if (filtroEstado !== 'ALL' && String(t.estado).toUpperCase() !== filtroEstado.toUpperCase()) {
        return false;
      }

      // Filtro de Fecha
      if (filtroFecha) {
        const fechaTurno = t.fecha_apertura ? t.fecha_apertura.substring(0, 10) : '';
        if (fechaTurno !== filtroFecha) return false;
      }

      return true;
    });

    if (turnosFiltrados.length === 0) {
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding: 2.5rem; color: #a1a1aa;">No hay turnos registrados que coincidan con los filtros.</td></tr>`;
      if (summaryText) summaryText.textContent = '0 turnos encontrados';
      return;
    }

    turnosFiltrados.forEach(t => {
      const tr = document.createElement('tr');

      const aperturaStr = formatFechaHora(t.fecha_apertura);
      const cierreStr = t.fecha_cierre ? formatFechaHora(t.fecha_cierre) : '<span style="color:#34d399; font-weight:600;">En curso</span>';

      let badgeClass = 'badge-cerrado';
      if (t.estado === 'ABIERTO') badgeClass = 'badge-abierto';
      if (t.estado === 'EN_CIERRE') badgeClass = 'badge-en-cierre';

      // Formateo explícito de la diferencia de arqueo con colores fijos
      let diffHtml = '<span style="color:#71717a;">-</span>';
      if (t.diferencia !== null && t.diferencia !== undefined && t.diferencia !== '') {
        const diffNum = parseFloat(t.diferencia);
        if (!isNaN(diffNum)) {
          if (diffNum < 0) {
            diffHtml = `<span style="color: #f87171 !important; font-weight: 700; font-family: ui-monospace, monospace;">-$ ${formatMoneda(Math.abs(diffNum))}</span>`;
          } else if (diffNum > 0) {
            diffHtml = `<span style="color: #34d399 !important; font-weight: 700; font-family: ui-monospace, monospace;">+$ ${formatMoneda(diffNum)}</span>`;
          } else {
            diffHtml = `<span style="color: #a1a1aa !important; font-family: ui-monospace, monospace;">$ 0,00</span>`;
          }
        }
      }

      let actionHtml = '-';
      if (t.estado === 'EN_CIERRE') {
        actionHtml = `<button type="button" class="btn-audit" onclick="window.__adminTurnos.abrirModalArqueo(${t.id})">Auditar</button>`;
      } else if (t.estado === 'ABIERTO') {
        actionHtml = `<button type="button" class="btn-force-close" onclick="window.__adminTurnos.forzarCierreAdmin(${t.id})">Cerrar</button>`;
      } else if (t.estado === 'CERRADO') {
        actionHtml = `<button type="button" class="btn-row-action" title="Revisar arqueo" onclick="window.__adminTurnos.abrirModalArqueo(${t.id})">Revisar</button>`;
      }

      const cajaNombre = t.caja_nombre || `Caja #${t.caja_fisica_id}`;
      const sucursalNombre = t.sucursal_nombre || '';

      tr.innerHTML = `
        <td style="font-family: ui-monospace, monospace; color: #a1a1aa;">${t.id}</td>
        <td>
          <strong>${escapeHtml(cajaNombre)}</strong> 
          ${sucursalNombre ? `<br><small style="color:#a1a1aa;">${escapeHtml(sucursalNombre)}</small>` : ''}
        </td>
        <td><strong style="color: #a78bfa;">${escapeHtml(t.nombre_turno || '-')}</strong></td>
        <td>${aperturaStr}</td>
        <td>${cierreStr}</td>
        <td style="text-align:right; font-family: ui-monospace, monospace;">$ ${formatMoneda(t.monto_inicial_efectivo)}</td>
        <td style="text-align:right; font-weight:600; font-family: ui-monospace, monospace;">$ ${formatMoneda(t.monto_esperado_sistema)}</td>
        
        <!-- Medios Digitales -->
        <td style="text-align:right; color:#94a3b8; font-family: ui-monospace, monospace;">$ ${formatMoneda(t.total_esperado_debito || 0)}</td>
        <td style="text-align:right; color:#94a3b8; font-family: ui-monospace, monospace;">$ ${formatMoneda(t.total_esperado_credito || 0)}</td>
        <td style="text-align:right; color:#94a3b8; font-family: ui-monospace, monospace;">$ ${formatMoneda(t.total_esperado_qr || 0)}</td>

        <td style="text-align:right; font-family: ui-monospace, monospace;">
          ${t.monto_real_arqueo !== null && t.monto_real_arqueo !== undefined ? `$ ${formatMoneda(t.monto_real_arqueo)}` : '<span style="color:#fbbf24; font-style:italic;">Pendiente</span>'}
        </td>
        <td style="text-align:right;">${diffHtml}</td>
        <td style="text-align:center;">
          <span class="badge ${badgeClass}">${t.estado}</span>
        </td>
        <td style="text-align:center;">
          ${actionHtml}
        </td>
      `;

      tbody.appendChild(tr);
    });

    if (summaryText) {
      summaryText.textContent = `Mostrando ${turnosFiltrados.length} de ${turnosList.length} turnos`;
    }
  }

  // 5. Configuración de Eventos de Filtros
  selectSucursal?.addEventListener('change', (e) => {
    filtroSucursal = e.target.value;
    renderizarTabla();
  });

  franjaPills?.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      franjaPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroFranja = btn.dataset.franja;
      renderizarTabla();
    });
  });

  inputFecha?.addEventListener('change', (e) => {
    filtroFecha = e.target.value;
    renderizarTabla();
  });

  selectEstado?.addEventListener('change', (e) => {
    filtroEstado = e.target.value;
    renderizarTabla();
  });

  btnLimpiar?.addEventListener('click', () => {
    filtroSucursal = 'all';
    filtroFranja = 'ALL';
    filtroFecha = '';
    filtroEstado = 'ALL';

    if (selectSucursal) selectSucursal.value = 'all';
    if (inputFecha) inputFecha.value = '';
    if (selectEstado) selectEstado.value = 'ALL';

    franjaPills?.querySelectorAll('.pill-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.franja === 'ALL');
    });

    renderizarTabla();
  });

  // 6. Manejo del Modal de Arqueo
  window.__adminTurnos = {
    abrirModalArqueo: (id) => {
      const turno = turnosList.find(t => t.id === id);
      if (!turno) return;

      turnoSeleccionadoParaArqueo = turno;
      if (modalTurnoId) modalTurnoId.textContent = `#${turno.id}`;
      if (modalCaja) modalCaja.textContent = `${turno.caja_nombre || `Caja #${turno.caja_fisica_id}`} ${turno.sucursal_nombre ? `(${turno.sucursal_nombre})` : ''}`;
      if (modalEsperado) modalEsperado.textContent = `$ ${formatMoneda(turno.monto_esperado_sistema)}`;
      
      if (modalDebito) modalDebito.textContent = `$ ${formatMoneda(turno.total_esperado_debito || 0)}`;
      if (modalCredito) modalCredito.textContent = `$ ${formatMoneda(turno.total_esperado_credito || 0)}`;
      if (modalQr) modalQr.textContent = `$ ${formatMoneda(turno.total_esperado_qr || 0)}`;

      if (inputArqueoReal) {
        inputArqueoReal.value = turno.monto_real_arqueo !== null && turno.monto_real_arqueo !== undefined 
          ? turno.monto_real_arqueo 
          : '';
      }

      if (inputArqueoObs) {
        inputArqueoObs.value = turno.observaciones || '';
      }
        
      inputArqueoReal?.dispatchEvent(new Event('input'));

      if (modalArqueo) modalArqueo.hidden = false;
      setTimeout(() => inputArqueoReal?.focus(), 50);
    },

    forzarCierreAdmin: (id) => {
      const turno = turnosList.find(t => t.id === id);
      if (!turno) return;

      abrirModalConfirm(
        'Forzar Cierre de Turno',
        `¿Desea forzar el cierre del turno #${turno.id} (${turno.nombre_turno || 'Turno activo'})?\nEl turno pasará al estado "EN_CIERRE" para realizar el arqueo.`,
        async () => {
          try {
            const res = await fetch(`/api/v1/turno_caja/${id}/cierre-rapido`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                monto_esperado_sistema: turno.monto_esperado_sistema
              })
            });

            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || 'Error al forzar el cierre del turno');
            }

            await cargarTurnos();
          } catch (err) {
            alert(err.message);
          }
        }
      );
    }
  };

  // Cálculo en vivo de la diferencia en el modal
  inputArqueoReal?.addEventListener('input', () => {
    if (!turnoSeleccionadoParaArqueo || !modalDiferencia) return;
    const real = parseFloat(inputArqueoReal.value) || 0;
    const esperado = Number(turnoSeleccionadoParaArqueo.monto_esperado_sistema || 0);
    const diff = Number((real - esperado).toFixed(2));

    if (diff < 0) {
      modalDiferencia.textContent = `Faltante: -$ ${formatMoneda(Math.abs(diff))}`;
      modalDiferencia.style.color = '#f87171';
    } else if (diff > 0) {
      modalDiferencia.textContent = `Sobrante: +$ ${formatMoneda(diff)}`;
      modalDiferencia.style.color = '#34d399';
    } else {
      modalDiferencia.textContent = `$ 0,00 (Exacto)`;
      modalDiferencia.style.color = '#a1a1aa';
    }
  });

  function cerrarModalArqueo() {
    if (modalArqueo) modalArqueo.hidden = true;
    turnoSeleccionadoParaArqueo = null;
  }

  btnModalArqueoClose?.addEventListener('click', cerrarModalArqueo);
  btnCancelArqueo?.addEventListener('click', cerrarModalArqueo);

  // Enviar arqueo auditado
  formArqueo?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!turnoSeleccionadoParaArqueo) return;

    const real = parseFloat(inputArqueoReal.value);
    if (isNaN(real) || real < 0) {
      alert('Por favor ingrese un monto válido mayor o igual a 0.');
      inputArqueoReal?.focus();
      return;
    }

    const id = turnoSeleccionadoParaArqueo.id;
    const esperado = Number(turnoSeleccionadoParaArqueo.monto_esperado_sistema || 0);
    const diferencia = Number((real - esperado).toFixed(2));
    const obsVal = inputArqueoObs ? inputArqueoObs.value.trim() : null;

    abrirModalConfirm(
      'Confirmar Arqueo y Cierre Definitivo',
      `¿Desea asentar el arqueo de $ ${formatMoneda(real)} para el turno #${id} y darlo por CERRADO?`,
      async () => {
        try {
          const res = await fetch(`/api/v1/turno_caja/${id}/arqueo`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              monto_real_arqueo: real,
              diferencia: diferencia,
              observaciones: obsVal || null,
              estado: 'CERRADO'
            })
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || errData.message || 'Error al asentar arqueo');
          }

          cerrarModalArqueo();
          await cargarTurnos();
        } catch (err) {
          alert(err.message);
        }
      }
    );
  });

  // 7. Modales de confirmación
  function abrirModalConfirm(titulo, mensaje, onConfirm) {
    if (modalConfirmTitle) modalConfirmTitle.textContent = titulo;
    if (modalConfirmMsg) modalConfirmMsg.textContent = mensaje;
    onConfirmCallback = onConfirm;
    if (modalConfirm) modalConfirm.hidden = false;
  }

  function cerrarModalConfirm() {
    if (modalConfirm) modalConfirm.hidden = true;
    onConfirmCallback = null;
  }

  btnConfirmCancel?.addEventListener('click', cerrarModalConfirm);
  btnConfirmAccept?.addEventListener('click', async () => {
    if (onConfirmCallback) await onConfirmCallback();
    cerrarModalConfirm();
  });

  // Logout
  btnLogout?.addEventListener('click', async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.replace('index.html');
  });

  // Helpers
  function formatMoneda(num) {
    return Number(num || 0).toLocaleString('es-AR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatFechaHora(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes}/${anio} ${hora}:${min} hs`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Inicio secuencial
  async function iniciarModulo() {
    await verificarSesion();
    await cargarSucursales();
    await cargarTurnos();
  }

  iniciarModulo();
});