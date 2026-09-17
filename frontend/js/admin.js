document.addEventListener('DOMContentLoaded', async () => {
  await verificarSesion();
  await cargarDashboardOperativo();
});

async function verificarSesion() {
  try {
    const res = await fetch('/api/v1/auth/me', { credentials: 'include' });
    if (!res.ok) window.location.replace('index.html');
    const data = await res.json();
    
    if (data.user?.rol !== 'ADMINISTRADOR') {
      alert('Acceso exclusivo a administradores.');
      window.location.replace('index.html');
      return;
    }

    const userNameEl = document.getElementById('user-name');
    if (userNameEl) {
      userNameEl.textContent = `${data.user.nombre} ${data.user.apellido || ''}`;
    }
  } catch {
    window.location.replace('index.html');
  }
}

async function cargarDashboardOperativo() {
  try {
    const res = await fetch('/api/v1/dashboard/resumen', { credentials: 'include' });
    if (!res.ok) throw new Error('Error al consultar datos');
    const data = await res.json();

    renderizarFlashKPIs(data.flashDiario);
    renderizarAlertasStock(data.alertasStock);
    renderizarCajasVivas(data.estadoCajas);
  } catch (error) {
    console.error('Error cargando el dashboard:', error);
  }
}

function renderizarFlashKPIs(flash) {
  if (!flash) return;

  const total = Number(flash.total_facturado_hoy || 0);
  const tickets = flash.tickets_hoy || 0;
  const activas = flash.cajas_activas || 0;
  const pendientes = flash.pendientes_arqueo || 0;

  document.getElementById('kpi-hoy-total').textContent = `$ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  document.getElementById('kpi-hoy-tickets').textContent = `${tickets} operaciones completadas hoy`;

  document.getElementById('kpi-cajas-activas').textContent = `${activas} activas`;
  document.getElementById('kpi-pendientes-arqueo').textContent = `${pendientes} esperando arqueo`;

  document.getElementById('kpi-medio-lider').textContent = flash.medio_lider || 'Sin ventas';
  document.getElementById('kpi-medio-monto').textContent = `$ ${Number(flash.monto_medio_lider || 0).toFixed(2)} recaudados`;
}

function renderizarAlertasStock(alertas) {
  const tbody = document.getElementById('tbody-alertas-stock');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!alertas || alertas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">✅ Todo el inventario se encuentra dentro de los niveles normales.</td></tr>`;
    return;
  }

  alertas.forEach(a => {
    const esAgotado = a.estado_alerta === 'AGOTADO';
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><strong>${a.descripcion}</strong></td>
      <td class="text-muted">${a.sucursal_nombre}</td>
      <td class="text-right font-mono" style="color: ${esAgotado ? 'var(--color-critical)' : 'var(--color-warning)'}; font-weight: 700;">
        ${Number(a.cantidad_disponible).toFixed(2)}
      </td>
      <td class="text-right font-mono text-muted">${Number(a.stock_minimo).toFixed(2)}</td>
      <td class="text-center">
        <span class="badge-alerta ${esAgotado ? 'badge-agotado' : 'badge-bajo'}">
          ${esAgotado ? 'AGOTADO' : 'STOCK BAJO'}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderizarCajasVivas(cajas) {
  const tbody = document.getElementById('tbody-cajas-vivas');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!cajas || cajas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">No hay cajas activas ni turnos pendientes en este momento.</td></tr>`;
    return;
  }

  cajas.forEach(c => {
    const enCierre = c.estado === 'EN_CIERRE';
    const abierto = c.estado === 'ABIERTO';
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><strong>${c.sucursal_nombre}</strong> <span class="text-muted">(${c.caja_nombre})</span></td>
      <td>${c.cajero_nombre || 'Sin ventas registradas'}</td>
      <td style="color: var(--color-purple); font-weight: 600;">${c.franja_horaria}</td>
      <td class="text-center">
        <span class="badge-alerta ${enCierre ? 'badge-bajo' : (abierto ? 'badge-alerta text-green' : 'badge-agotado')}" 
              style="${abierto ? 'background: rgba(52,211,153,0.15); border: 1px solid rgba(52,211,153,0.3);' : ''}">
          ${c.estado}
        </span>
      </td>
      <td class="text-right">
        <a href="turnos.html" style="font-size: 0.75rem; color: var(--color-edit); text-decoration: none; font-weight: 600;">
          ${enCierre ? 'Auditar →' : 'Ver →'}
        </a>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.cerrarSesion = async function() {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  window.location.replace('index.html');
};