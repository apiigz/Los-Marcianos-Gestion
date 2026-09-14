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

      userDisplay.textContent = `${data.user.nombre} ${data.user.apellido}`;
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

      selectSucursal.innerHTML = '<option value="all">Todas las sucursales</option>';
      sucursalesList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nombre;
        selectSucursal.appendChild(opt);
      });
    } catch (err) {
      console.warn('Error al cargar sucursales:', err);
    }
  }

  // 3. Cargar turnos desde el backend
  async function cargarTurnos() {
    try {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem;">Cargando turnos de caja...</td></tr>`;
      
      const res = await fetch('/api/v1/turno_caja', { credentials: 'include' });
      if (!res.ok) throw new Error('Error al obtener turnos');
      turnosList = await res.json();

      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar turnos desde el servidor.</td></tr>`;
    }
  }

  // 4. Renderizado con filtrado en cliente
  function renderizarTabla() {
    tbody.innerHTML = '';

    const turnosFiltrados = turnosList.filter(t => {
      if (filtroSucursal !== 'all' && String(t.sucursal_id) !== String(filtroSucursal)) return false;
      if (filtroFranja !== 'ALL' && t.nombre_turno?.toUpperCase() !== filtroFranja) return false;
      if (filtroEstado !== 'ALL' && t.estado !== filtroEstado) return false;
      if (filtroFecha) {
        const fechaTurno = t.fecha_apertura ? t.fecha_apertura.substring(0, 10) : '';
        if (fechaTurno !== filtroFecha) return false;
      }
      return true;
    });

    if (turnosFiltrados.length === 0) {
      // Ajustar colspan a 14
      tbody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding: 2rem;">No hay turnos registrados que coincidan con los filtros.</td></tr>`;
      summaryText.textContent = '0 turnos encontrados';
      return;
    }

    turnosFiltrados.forEach(t => {
      const tr = document.createElement('tr');

      const aperturaStr = formatFechaHora(t.fecha_apertura);
      const cierreStr = t.fecha_cierre ? formatFechaHora(t.fecha_cierre) : '<span style="color:#15803d; font-weight:600;">En curso</span>';

      let badgeClass = 'badge-cerrado';
      if (t.estado === 'ABIERTO') badgeClass = 'badge-abierto';
      if (t.estado === 'EN_CIERRE') badgeClass = 'badge-en-cierre';

      let diffHtml = '<span class="diff-zero">-</span>';
      if (t.diferencia !== null && t.diferencia !== undefined) {
        const diffNum = Number(t.diferencia);
        if (diffNum < 0) {
          diffHtml = `<span class="diff-negative">-$ ${formatMoneda(Math.abs(diffNum))}</span>`;
        } else if (diffNum > 0) {
          diffHtml = `<span class="diff-ok">+$ ${formatMoneda(diffNum)}</span>`;
        } else {
          diffHtml = `<span class="diff-zero">$ 0,00</span>`;
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
        <td>${t.id}</td>
        <td><strong>${escapeHtml(cajaNombre)}</strong> ${sucursalNombre ? `<br><small style="color:#64748b;">${escapeHtml(sucursalNombre)}</small>` : ''}</td>
        <td><strong>${escapeHtml(t.nombre_turno || '-')}</strong></td>
        <td>${aperturaStr}</td>
        <td>${cierreStr}</td>
        <td style="text-align:right;">$ ${formatMoneda(t.monto_inicial_efectivo)}</td>
        <td style="text-align:right; font-weight:600;">$ ${formatMoneda(t.monto_esperado_sistema)}</td>
        
        <!-- CELDAS DE MEDIOS DIGITALES -->
        <td style="text-align:right; color:#475569;">$ ${formatMoneda(t.total_esperado_debito || 0)}</td>
        <td style="text-align:right; color:#475569;">$ ${formatMoneda(t.total_esperado_credito || 0)}</td>
        <td style="text-align:right; color:#475569;">$ ${formatMoneda(t.total_esperado_qr || 0)}</td>
        <!-- FIN CELDAS DE MEDIOS DIGITALES -->

        <td style="text-align:right;">${t.monto_real_arqueo !== null && t.monto_real_arqueo !== undefined ? `$ ${formatMoneda(t.monto_real_arqueo)}` : '<span style="color:#b45309; font-style:italic;">Pendiente</span>'}</td>
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

    summaryText.textContent = `Mostrando ${turnosFiltrados.length} de ${turnosList.length} turnos`;
  }

  // 5. Configuración de Filtros
  selectSucursal.addEventListener('change', (e) => {
    filtroSucursal = e.target.value;
    renderizarTabla();
  });

  franjaPills.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      franjaPills.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroFranja = btn.dataset.franja;
      renderizarTabla();
    });
  });

  inputFecha.addEventListener('change', (e) => {
    filtroFecha = e.target.value;
    renderizarTabla();
  });

  selectEstado.addEventListener('change', (e) => {
    filtroEstado = e.target.value;
    renderizarTabla();
  });

  btnLimpiar.addEventListener('click', () => {
    filtroSucursal = 'all';
    filtroFranja = 'ALL';
    filtroFecha = '';
    filtroEstado = 'ALL';

    selectSucursal.value = 'all';
    inputFecha.value = '';
    selectEstado.value = 'ALL';

    franjaPills.querySelectorAll('.pill-btn').forEach(b => {
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
      modalTurnoId.textContent = `#${turno.id}`;
      modalCaja.textContent = `${turno.caja_nombre || `Caja #${turno.caja_fisica_id}`} ${turno.sucursal_nombre ? `(${turno.sucursal_nombre})` : ''}`;
      modalEsperado.textContent = `$ ${formatMoneda(turno.monto_esperado_sistema)}`;
      
      // Totales de medios electrónicos informativos
      if (modalDebito) modalDebito.textContent = `$ ${formatMoneda(turno.total_esperado_debito || 0)}`;
      if (modalCredito) modalCredito.textContent = `$ ${formatMoneda(turno.total_esperado_credito || 0)}`;
      if (modalQr) modalQr.textContent = `$ ${formatMoneda(turno.total_esperado_qr || 0)}`;

      // Precarga de valores previos si existen
      inputArqueoReal.value = turno.monto_real_arqueo !== null && turno.monto_real_arqueo !== undefined 
        ? turno.monto_real_arqueo 
        : '';

      if (inputArqueoObs) {
        inputArqueoObs.value = turno.observaciones || '';
      }
        
      inputArqueoReal.dispatchEvent(new Event('input'));

      modalArqueo.hidden = false;
      setTimeout(() => inputArqueoReal.focus(), 50);
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

  // Cálculo en vivo de la diferencia sobre efectivo
  inputArqueoReal.addEventListener('input', () => {
    if (!turnoSeleccionadoParaArqueo) return;
    const real = parseFloat(inputArqueoReal.value) || 0;
    const esperado = Number(turnoSeleccionadoParaArqueo.monto_esperado_sistema || 0);
    const diff = Number((real - esperado).toFixed(2));

    if (diff < 0) {
      modalDiferencia.textContent = `Faltante: -$ ${formatMoneda(Math.abs(diff))}`;
      modalDiferencia.className = 'diff-negative';
    } else if (diff > 0) {
      modalDiferencia.textContent = `Sobrante: +$ ${formatMoneda(diff)}`;
      modalDiferencia.className = 'diff-ok';
    } else {
      modalDiferencia.textContent = `$ 0,00 (Exacto)`;
      modalDiferencia.className = 'diff-zero';
    }
  });

  function cerrarModalArqueo() {
    modalArqueo.hidden = true;
    turnoSeleccionadoParaArqueo = null;
  }

  btnModalArqueoClose.addEventListener('click', cerrarModalArqueo);
  btnCancelArqueo.addEventListener('click', cerrarModalArqueo);

  // Enviar arqueo auditado
  formArqueo.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!turnoSeleccionadoParaArqueo) return;

    const real = parseFloat(inputArqueoReal.value);
    if (isNaN(real) || real < 0) {
      alert('Por favor ingrese un monto válido mayor o igual a 0.');
      inputArqueoReal.focus();
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

  // Logout
  btnLogout.addEventListener('click', async () => {
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