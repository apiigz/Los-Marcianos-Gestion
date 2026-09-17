document.addEventListener('DOMContentLoaded', async () => {
  await inicializarModulo();
  configurarFiltros();
  await cargarEstadisticas();
});

async function inicializarModulo() {
  try {
    const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
    if (!res.ok) window.location.replace('index.html');
    const data = await res.json();
    const user = data.user;

    if (user.rol !== 'ADMINISTRADOR') {
      alert('Acceso denegado: solo personal administrativo.');
      window.location.replace('ventas.html');
      return;
    }

    const display = document.getElementById('admin-user-display');
    if (display) display.textContent = `${user.nombre} ${user.apellido || ''}`;
  } catch {
    window.location.replace('index.html');
  }
}

function configurarFiltros() {
  const selectRango = document.getElementById('filtro-rango');
  const contenedorCustom = document.getElementById('contenedor-fechas-custom');
  const btnFiltrar = document.getElementById('btn-filtrar');

  selectRango?.addEventListener('change', () => {
    if (selectRango.value === 'personalizado') {
      contenedorCustom?.classList.remove('hidden');
    } else {
      contenedorCustom?.classList.add('hidden');
      cargarEstadisticas();
    }
  });

  btnFiltrar?.addEventListener('click', () => cargarEstadisticas());
}

async function cargarEstadisticas() {
  const selectRango = document.getElementById('filtro-rango').value;
  let fechaDesde = '';
  let fechaHasta = '';

  const ahora = new Date();
  const fechaHoyStr = ahora.toISOString().split('T')[0];

  if (selectRango === 'hoy') {
    fechaDesde = fechaHoyStr;
    fechaHasta = fechaHoyStr;
  } else if (selectRango === '7dias') {
    const d = new Date();
    d.setDate(ahora.getDate() - 7);
    fechaDesde = d.toISOString().split('T')[0];
    fechaHasta = fechaHoyStr;
  } else if (selectRango === '30dias') {
    const d = new Date();
    d.setDate(ahora.getDate() - 30);
    fechaDesde = d.toISOString().split('T')[0];
    fechaHasta = fechaHoyStr;
  } else if (selectRango === 'personalizado') {
    fechaDesde = document.getElementById('fecha-desde').value;
    fechaHasta = document.getElementById('fecha-hasta').value;
    if (!fechaDesde || !fechaHasta) {
      alert('Seleccione ambas fechas para filtrar.');
      return;
    }
  }

  try {
    const url = `/api/v1/estadisticas/dashboard?fecha_desde=${fechaDesde}&fecha_hasta=${fechaHasta}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('Error al consultar estadísticas.');
    const data = await res.json();

    renderizarKPIs(data.kpis);
    renderizarTopProductos(data.topProductos);
    renderizarMediosPago(data.mediosPago);
    renderizarAuditoriaEmpleados(data.empleados);
  } catch (error) {
    console.error(error);
  }
}

function renderizarKPIs(kpis) {
  document.getElementById('kpi-facturacion').textContent = `$ ${Number(kpis.facturacion_total).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-tickets').textContent = `${kpis.cantidad_tickets} tickets emitidos`;
  
  document.getElementById('kpi-ganancia').textContent = `$ ${Number(kpis.ganancia_bruta).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  
  document.getElementById('kpi-faltantes').textContent = `-$ ${Math.abs(Number(kpis.total_faltantes)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-sobrantes').textContent = `Sobrantes: +$ ${Number(kpis.total_sobrantes).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  document.getElementById('kpi-fiados').textContent = `$ ${Number(kpis.total_deuda_fiados).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
}

function renderizarTopProductos(productos) {
  const tbody = document.getElementById('tbody-top-productos');
  tbody.innerHTML = '';

  if (!productos || productos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted">No hubo ventas registradas en este período.</td></tr>`;
    return;
  }

  productos.forEach(p => {
    const esPesable = (p.unidad_medida || '').toUpperCase().includes('K');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${p.descripcion}</strong>
        ${p.es_combo ? '<span style="color:#7c3aed; font-size:0.7rem; margin-left:4px;">[COMBO]</span>' : ''}
      </td>
      <td class="text-center">${Number(p.unidades_vendidas).toFixed(esPesable ? 3 : 0)} ${esPesable ? 'kg' : 'u.'}</td>
      <td class="text-right font-mono">$ ${Number(p.total_recaudado).toFixed(2)}</td>
      <td class="text-right font-mono" style="color:#059669; font-weight:600;">$ ${Number(p.ganancia_neta).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderizarMediosPago(medios) {
  const tbody = document.getElementById('tbody-medios-pago');
  tbody.innerHTML = '';

  if (!medios || medios.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">Sin registros.</td></tr>`;
    return;
  }

  medios.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${m.medio_pago}</strong></td>
      <td class="text-center">${m.cantidad_operaciones}</td>
      <td class="text-right font-mono" style="font-weight:600;">$ ${Number(m.total_monto).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderizarAuditoriaEmpleados(empleados) {
  const tbody = document.getElementById('tbody-empleados');
  tbody.innerHTML = '';

  if (!empleados || empleados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">Sin personal con actividad registrada.</td></tr>`;
    return;
  }

  empleados.forEach(e => {
    const balance = Number(e.balance_arqueos);
    const faltante = Math.abs(Number(e.total_faltante));
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td><strong>${e.nombre_completo}</strong></td>
      <td class="text-muted font-mono">${e.dni}</td>
      <td class="text-center">${e.tickets_emitidos}</td>
      <td class="text-right font-mono">$ ${Number(e.total_vendido).toFixed(2)}</td>
      <td class="text-right font-mono" style="color:#7c3aed;">$ ${Number(e.total_consumo_personal).toFixed(2)}</td>
      <td class="text-right font-mono" style="color:${faltante > 0 ? '#dc2626' : '#64748b'}; font-weight:${faltante > 0 ? '700' : 'normal'};">
        ${faltante > 0 ? `-$ ${faltante.toFixed(2)}` : '$ 0.00'}
      </td>
      <td class="text-right font-mono" style="color:${balance < 0 ? '#dc2626' : (balance > 0 ? '#059669' : '#64748b')}; font-weight:700;">
        ${balance > 0 ? `+$ ${balance.toFixed(2)}` : (balance < 0 ? `-$ ${Math.abs(balance).toFixed(2)}` : '$ 0.00')}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.cerrarSesion = async function() {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.replace('index.html');
};