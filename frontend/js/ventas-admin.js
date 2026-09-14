document.addEventListener('DOMContentLoaded', () => {
  // Estado local
  let ventasList = [];
  let sucursalesList = [];
  let empleadosList = [];
  let expandedVentaId = null;

  // Filtros
  let filtroSucursal = 'all';
  let filtroEmpleado = 'all';
  let filtroMedio = 'all';
  let filtroFranja = 'ALL';
  let filtroDesde = '';
  let filtroHasta = '';
  let filtroFiscal = 'all';

  // Elementos DOM
  const tbody = document.getElementById('ventas-tbody');
  const userDisplay = document.getElementById('user-display');
  const btnLogout = document.getElementById('btn-logout');
  const countText = document.getElementById('ventas-count-text');
  const totalAmountText = document.getElementById('ventas-total-amount');

  // Selectores de Filtro
  const selectSucursal = document.getElementById('filter-sucursal');
  const selectEmpleado = document.getElementById('filter-empleado');
  const selectMedio = document.getElementById('filter-medio-pago');
  const pillsFranja = document.getElementById('pills-franja');
  const inputDesde = document.getElementById('filter-desde');
  const inputHasta = document.getElementById('filter-hasta');
  const selectFiscal = document.getElementById('filter-fiscal');
  const btnLimpiar = document.getElementById('btn-limpiar-filtros');

  // Modal Comprobante
  const modalComprobante = document.getElementById('modal-comprobante');
  const btnModalReceiptClose = document.getElementById('btn-modal-receipt-close');
  const btnReceiptClose = document.getElementById('btn-receipt-close');

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

  // 2. Cargar listas auxiliares para filtros
  async function cargarAuxiliares() {
    try {
      const [resSuc, resEmp] = await Promise.all([
        fetch('/api/v1/sucursales', { credentials: 'include' }),
        fetch('/api/v1/usuarios', { credentials: 'include' })
      ]);

      if (resSuc.ok) sucursalesList = await resSuc.json();
      if (resEmp.ok) empleadosList = await resEmp.json();

      selectSucursal.innerHTML = '<option value="all">Todas las sucursales</option>';
      sucursalesList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.nombre;
        selectSucursal.appendChild(opt);
      });

      selectEmpleado.innerHTML = '<option value="all">Todos los empleados</option>';
      empleadosList.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.nombre} ${u.apellido}`;
        selectEmpleado.appendChild(opt);
      });
    } catch (e) {
      console.warn('Error al cargar auxiliares:', e);
    }
  }

  // 3. Cargar ventas completas (con detalle y pagos)
  async function cargarVentas() {
    try {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem;">Cargando historial de ventas...</td></tr>`;

      const res = await fetch('/api/v1/ventas', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudo obtener las ventas');
      ventasList = await res.json();

      renderizarTabla();
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #ef4444;">Error al cargar ventas desde el servidor.</td></tr>`;
    }
  }

  // 4. Renderizado con Maestro-Detalle
  function renderizarTabla() {
    tbody.innerHTML = '';

    const ventasFiltradas = ventasList.filter(v => {
      // Sucursal
      if (filtroSucursal !== 'all' && String(v.sucursal_id) !== String(filtroSucursal)) return false;
      // Empleado
      if (filtroEmpleado !== 'all' && String(v.usuario_id) !== String(filtroEmpleado)) return false;
      // Franja Horaria
      if (filtroFranja !== 'ALL' && v.nombre_turno?.toUpperCase() !== filtroFranja) return false;
      
      // Medio de pago (compara dentro del array de pagos o string consolidado)
      if (filtroMedio !== 'all') {
        const tieneMedio = (v.pagos || []).some(p => p.medio_pago?.toUpperCase() === filtroMedio);
        if (!tieneMedio) return false;
      }

      // Rango de fechas
      const fechaVenta = v.fecha_hora ? v.fecha_hora.substring(0, 10) : '';
      if (filtroDesde && fechaVenta < filtroDesde) return false;
      if (filtroHasta && fechaVenta > filtroHasta) return false;

      // Estado Fiscal ARCA
      const tieneCae = Boolean(v.comprobante?.cae);
      if (filtroFiscal === 'CON_CAE' && !tieneCae) return false;
      if (filtroFiscal === 'SIN_CAE' && tieneCae) return false;

      return true;
    });

    if (ventasFiltradas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem;">No hay ventas que coincidan con los filtros seleccionados.</td></tr>`;
      countText.textContent = '0 ventas encontradas';
      totalAmountText.textContent = 'Total Facturado: $ 0,00';
      return;
    }

    let sumaTotal = 0;

    ventasFiltradas.forEach(v => {
      const isExpanded = expandedVentaId === v.id;
      const totalNum = Number(v.total || 0);
      sumaTotal += totalNum;

      // Medios de pago resumidos en badges
      const mediosUnicos = [...new Set((v.pagos || []).map(p => p.medio_pago || 'EFECTIVO'))];
      const badgesPagoHtml = mediosUnicos.map(m => `<span class="badge-pago">${escapeHtml(m)}</span>`).join(' ');

      // ARCA Comprobante
      let fiscalHtml = '<span class="badge-arca-none">Ticket X (No fiscal)</span>';
      if (v.comprobante && v.comprobante.cae) {
        const pto = String(v.comprobante.punto_de_venta || 1).padStart(4, '0');
        const nro = String(v.comprobante.numero_comprobante || 0).padStart(8, '0');
        fiscalHtml = `
          <span class="badge-arca-ok" onclick="event.stopPropagation(); window.__adminVentas.verComprobante(${v.id})" title="Ver Comprobante Electrónico">
            ${escapeHtml(v.comprobante.tipo_comprobante || 'FC B')} ${pto}-${nro}
          </span>
        `;
      }

      // Fila principal
      const trMain = document.createElement('tr');
      trMain.className = `main-row ${isExpanded ? 'expanded' : ''}`;
      trMain.innerHTML = `
        <td style="text-align:center;"><button type="button" class="btn-toggle-expand">${isExpanded ? '▼' : '▶'}</button></td>
        <td>#${v.id}</td>
        <td>${formatFechaHora(v.fecha_hora)}</td>
        <td><strong>${escapeHtml(v.sucursal_nombre || '')}</strong><br><small style="color:#64748b;">${escapeHtml(v.caja_nombre || '')}</small></td>
        <td>${escapeHtml(v.usuario_nombre || 'Cajero')}</td>
        <td><strong>${escapeHtml(v.nombre_turno || '-')}</strong></td>
        <td>${badgesPagoHtml || '<span class="badge-pago">EFECTIVO</span>'}</td>
        <td>${fiscalHtml}</td>
        <td style="text-align:right; font-weight:700; color:#0284c7;">$ ${formatMoneda(totalNum)}</td>
      `;

      trMain.addEventListener('click', () => {
        expandedVentaId = isExpanded ? null : v.id;
        renderizarTabla();
      });

      tbody.appendChild(trMain);

      // Fila expandida con el detalle
      if (isExpanded) {
        const trDetail = document.createElement('tr');
        trDetail.className = 'expanded-detail-row';

        const itemsHtml = (v.detalles || []).map(d => `
          <tr>
            <td style="font-family:monospace;">${escapeHtml(d.codigo_barra || '-')}</td>
            <td><strong>${escapeHtml(d.producto_descripcion || d.descripcion || 'Artículo')}</strong></td>
            <td style="text-align:center;">${d.cantidad}</td>
            <td style="text-align:right;">$ ${formatMoneda(d.precio_unitario)}</td>
            <td style="text-align:center;">${Number(d.alicuota_iva || 21).toFixed(1)}%</td>
            <td style="text-align:right; font-weight:600;">$ ${formatMoneda(d.subtotal)}</td>
          </tr>
        `).join('');

        const pagosHtml = (v.pagos || []).map(p => `
          <tr>
            <td><strong>${escapeHtml(p.medio_pago)}</strong></td>
            <td style="text-align:right;">$ ${formatMoneda(p.monto)}</td>
            <td style="text-align:right;">$ ${formatMoneda(p.recargo || 0)}</td>
            <td style="text-align:right; font-weight:600;">$ ${formatMoneda(p.monto_total || p.monto)}</td>
          </tr>
        `).join('');

        trDetail.innerHTML = `
          <td colspan="9" style="padding:0;">
            <div class="expanded-detail-container">
              
              <!-- Subtabla Artículos -->
              <div class="detail-card">
                <h4>Productos Comprados (${(v.detalles || []).length})</h4>
                <table class="inner-table">
                  <thead>
                    <tr>
                      <th>Cód.</th>
                      <th>Descripción</th>
                      <th style="text-align:center;">Cant.</th>
                      <th style="text-align:right;">Precio</th>
                      <th style="text-align:center;">IVA</th>
                      <th style="text-align:right;">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>${itemsHtml || '<tr><td colspan="6" style="text-align:center;">Sin detalle registrado</td></tr>'}</tbody>
                </table>
              </div>

              <!-- Subtabla Pagos y Fiscal -->
              <div class="detail-card">
                <h4>Desglose de Pago</h4>
                <table class="inner-table" style="margin-bottom:0.75rem;">
                  <thead>
                    <tr>
                      <th>Medio</th>
                      <th style="text-align:right;">Monto</th>
                      <th style="text-align:right;">Rec.</th>
                      <th style="text-align:right;">Total</th>
                    </tr>
                  </thead>
                  <tbody>${pagosHtml || `<tr><td>EFECTIVO</td><td colspan="3" style="text-align:right;">$ ${formatMoneda(v.total)}</td></tr>`}</tbody>
                </table>

                <h4>Auditoría Fiscal ARCA</h4>
                <div class="fiscal-summary-list">
                  <p><strong>Estado:</strong> ${v.comprobante?.cae ? '<span style="color:#15803d; font-weight:600;">Autorizado por ARCA</span>' : '<span style="color:#64748b;">No fiscalizado</span>'}</p>
                  <p><strong>CAE:</strong> ${v.comprobante?.cae || 'N/A'}</p>
                  <p><strong>Vencimiento:</strong> ${v.comprobante?.fecha_vto_cae ? v.comprobante.fecha_vto_cae.substring(0, 10) : 'N/A'}</p>
                  ${v.comprobante?.cae ? `<button type="button" class="btn-view-receipt" onclick="window.__adminVentas.verComprobante(${v.id})">Visualizar Comprobante Completo</button>` : ''}
                </div>
              </div>

            </div>
          </td>
        `;
        tbody.appendChild(trDetail);
      }
    });

    countText.textContent = `Mostrando ${ventasFiltradas.length} de ${ventasList.length} ventas`;
    totalAmountText.textContent = `Total Facturado: $ ${formatMoneda(sumaTotal)}`;
  }

  // 5. Configurar Filtros
  selectSucursal.addEventListener('change', (e) => { filtroSucursal = e.target.value; renderizarTabla(); });
  selectEmpleado.addEventListener('change', (e) => { filtroEmpleado = e.target.value; renderizarTabla(); });
  selectMedio.addEventListener('change', (e) => { filtroMedio = e.target.value; renderizarTabla(); });
  selectFiscal.addEventListener('change', (e) => { filtroFiscal = e.target.value; renderizarTabla(); });
  inputDesde.addEventListener('change', (e) => { filtroDesde = e.target.value; renderizarTabla(); });
  inputHasta.addEventListener('change', (e) => { filtroHasta = e.target.value; renderizarTabla(); });

  pillsFranja.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      pillsFranja.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filtroFranja = btn.dataset.franja;
      renderizarTabla();
    });
  });

  btnLimpiar.addEventListener('click', () => {
    filtroSucursal = 'all';
    filtroEmpleado = 'all';
    filtroMedio = 'all';
    filtroFranja = 'ALL';
    filtroDesde = '';
    filtroHasta = '';
    filtroFiscal = 'all';

    selectSucursal.value = 'all';
    selectEmpleado.value = 'all';
    selectMedio.value = 'all';
    selectFiscal.value = 'all';
    inputDesde.value = '';
    inputHasta.value = '';

    pillsFranja.querySelectorAll('.pill-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.franja === 'ALL');
    });

    renderizarTabla();
  });

  // 6. Modal de Comprobante Fiscal
  window.__adminVentas = {
    verComprobante: (id) => {
      const v = ventasList.find(item => item.id === id);
      if (!v || !v.comprobante) return;

      const c = v.comprobante;
      const pto = String(c.punto_de_venta || 1).padStart(4, '0');
      const nro = String(c.numero_comprobante || 0).padStart(8, '0');

      document.getElementById('receipt-tipo-comprobante').textContent = c.tipo_comprobante || 'FACTURA B';
      document.getElementById('receipt-numero').textContent = `Punto de Venta: ${pto} - Comp. Nro: ${nro}`;
      document.getElementById('receipt-fecha').textContent = `Fecha: ${formatFechaHora(v.fecha_hora)}`;
      document.getElementById('receipt-receptor').textContent = c.doc_nro ? `CUIT/DNI: ${c.doc_nro}` : 'Consumidor Final';
      document.getElementById('receipt-total').textContent = `$ ${formatMoneda(v.total)}`;
      document.getElementById('receipt-cae').textContent = c.cae || '74123456789012';
      document.getElementById('receipt-vto-cae').textContent = c.fecha_vto_cae ? c.fecha_vto_cae.substring(0, 10) : 'N/A';

      // Ítems en factura
      const tbodyReceipt = document.getElementById('receipt-items-tbody');
      tbodyReceipt.innerHTML = (v.detalles || []).map(d => `
        <tr>
          <td>${d.cantidad}</td>
          <td>${escapeHtml(d.producto_descripcion || d.descripcion || 'Artículo')}</td>
          <td style="text-align:right;">$ ${formatMoneda(d.precio_unitario)}</td>
          <td style="text-align:right;">$ ${formatMoneda(d.subtotal)}</td>
        </tr>
      `).join('');

      modalComprobante.hidden = false;
    }
  };

  function cerrarModalComprobante() {
    modalComprobante.hidden = true;
  }
  btnModalReceiptClose.addEventListener('click', cerrarModalComprobante);
  btnReceiptClose.addEventListener('click', cerrarModalComprobante);

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
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Inicialización
  async function iniciarModulo() {
    await verificarSesion();
    await cargarAuxiliares();
    await cargarVentas();
  }

  iniciarModulo();
});