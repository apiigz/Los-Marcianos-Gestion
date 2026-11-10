document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmt = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fh = (iso) => { const d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); };
  const fd = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
  const remito = (n) => '#' + String(n).padStart(6, '0');

  let actual = null;
  let opciones = null;

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.message || 'Error en la solicitud');
    return data;
  }

  // ---------- Lista ----------
  async function cargar() {
    try {
      const estado = $('filtro-estado').value;
      const lista = await api('/api/v1/mayorista/viajes' + (estado ? `?estado=${estado}` : ''));
      $('viajes-tbody').innerHTML = lista.length ? lista.map(v => `
        <tr style="cursor:pointer;" onclick="window.__viajes.abrir(${v.id})">
          <td>#${v.id}</td><td>${fd(v.fecha)}</td><td>${esc(v.vehiculo)}</td><td>${esc(v.encargado)}</td>
          <td><span class="estado estado-${v.estado}">${v.estado}</span></td>
          <td style="text-align:right;">${v.pedidos}</td></tr>`).join('')
        : `<tr><td colspan="6" style="text-align:center; padding:2rem;">No hay viajes.</td></tr>`;
    } catch (e) {
      $('viajes-tbody').innerHTML = `<tr><td colspan="6" style="color:#ef4444; text-align:center; padding:2rem;">${esc(e.message)}</td></tr>`;
    }
  }

  // ---------- Nuevo viaje ----------
  async function abrirNuevo() {
    try {
      if (!opciones) opciones = await api('/api/v1/mayorista/viajes/opciones');
    } catch (e) { alert(e.message); return; }
    $('n-vehiculo').innerHTML = opciones.vehiculos.map(v => `<option value="${v.id}">${esc(v.nombre)}${v.patente ? ' · ' + esc(v.patente) : ''}</option>`).join('');
    $('n-encargado').innerHTML = opciones.encargados.map(u => `<option value="${u.id}">${esc(u.apellido)}, ${esc(u.nombre)}</option>`).join('');
    $('n-obs').value = '';
    $('modal-nuevo').hidden = false;
  }

  async function crear() {
    try {
      const v = await api('/api/v1/mayorista/viajes', { method: 'POST', body: {
        vehiculo_id: Number($('n-vehiculo').value), encargado_id: Number($('n-encargado').value), observaciones: $('n-obs').value
      } });
      $('modal-nuevo').hidden = true;
      await cargar();
      await abrir(v.id);
    } catch (e) { alert(e.message); }
  }

  // ---------- Detalle ----------
  async function abrir(id) {
    try {
      const v = await api(`/api/v1/mayorista/viajes/${id}`);
      actual = v;
      $('v-titulo').textContent = `Viaje #${v.id} · ${fd(v.fecha)} · ${v.vehiculo}`;

      const efectivo = v.cobros.find(c => c.medio === 'EFECTIVO');
      const transf = v.cobros.find(c => c.medio === 'TRANSFERENCIA');

      let html = `
        <p><span class="estado estado-${v.estado}">${v.estado}</span> &nbsp; Encargado: <b>${esc(v.encargado)}</b>
          ${v.salida_at ? ` · Salió ${fh(v.salida_at)}` : ''}${v.regreso_at ? ` · Regresó ${fh(v.regreso_at)}` : ''}
          ${v.observaciones ? `<br><small class="helper-text">${esc(v.observaciones)}</small>` : ''}</p>

        <h4 class="sec">Pedidos del viaje</h4>
        <table class="users-table"><thead><tr><th>Remito</th><th>Cliente</th><th>Estado</th>
          <th style="text-align:right;">Total</th><th style="text-align:right;">Cobrado</th><th></th></tr></thead><tbody>
        ${v.pedidos.map(p => `<tr><td>${remito(p.remito_numero)}</td>
            <td>${esc(p.cliente)}${p.direccion ? `<br><small class="helper-text">${esc(p.direccion)}</small>` : ''}</td>
            <td>${p.estado}</td>
            <td style="text-align:right;">$ ${fmt(p.total)}</td><td style="text-align:right;">$ ${fmt(p.cobrado)}</td>
            <td style="white-space:nowrap;">
              <a href="mayorista-pedidos.html#${p.id}" class="btn-inline-cancel" style="text-decoration:none;">Abrir</a>
              ${p.estado === 'EN_REPARTO' && v.estado === 'ABIERTO' && Auth.can('mayorista.cargar_camioneta')
                ? `<button type="button" class="btn-inline-cancel" onclick="window.__viajes.quitar(${p.id})">Quitar</button>` : ''}
            </td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;">Todavía no hay pedidos cargados.</td></tr>'}
        </tbody></table>`;

      if (v.estado === 'ABIERTO' && Auth.can('mayorista.cargar_camioneta')) {
        html += `<h4 class="sec">Pedidos preparados para cargar</h4>
          <table class="users-table"><tbody>
          ${v.preparados.map(p => `<tr><td>${remito(p.remito_numero)}</td><td>${esc(p.cliente)}</td>
              <td>${esc(p.sucursal)}</td><td style="text-align:right;">$ ${fmt(p.total)}</td>
              <td><button type="button" class="btn-inline-accept" onclick="window.__viajes.cargarPedido(${p.id})">Cargar</button></td></tr>`).join('')
            || '<tr><td style="text-align:center;">No hay pedidos preparados esperando.</td></tr>'}
          </tbody></table>`;
      }

      html += `<h4 class="sec">Cobros durante el reparto</h4>
        <div class="kpis">
          <div class="kpi"><small>Efectivo cobrado</small><b>$ ${fmt(efectivo?.total || 0)}</b></div>
          <div class="kpi"><small>Transferencias</small><b>$ ${fmt(transf?.total || 0)}</b></div>
          <div class="kpi"><small>Efectivo por rendir</small><b>$ ${fmt(v.efectivo_por_rendir)}</b></div>
        </div>`;

      if (v.rendicion) {
        const r = v.rendicion;
        const dif = Number(r.diferencia);
        html += `<h4 class="sec">Rendición</h4>
          <p>Esperado <b>$ ${fmt(r.efectivo_esperado)}</b> · Contado <b>$ ${fmt(r.efectivo_contado)}</b> ·
            Diferencia <b class="${dif < 0 ? 'debe' : dif > 0 ? 'favor' : ''}">${dif > 0 ? '+' : ''}$ ${fmt(dif)}</b><br>
            Entregó: ${esc(r.entregado_por_nombre)} · Recibió: ${esc(r.recibido_por_nombre)} · ${fh(r.created_at)}
            ${r.observaciones ? `<br><small class="helper-text">${esc(r.observaciones)}</small>` : ''}</p>`;
      }

      $('v-body').innerHTML = html;

      const show = (id, c) => ($(id).style.display = c ? '' : 'none');
      show('v-salir', v.estado === 'ABIERTO' && Auth.can('mayorista.cargar_camioneta'));
      show('v-cancelar', v.estado === 'ABIERTO' && Auth.can('mayorista.cargar_camioneta'));
      show('v-regresar', v.estado === 'EN_CURSO' && Auth.canAny(['mayorista.cargar_camioneta', 'mayorista.entregar']));
      show('v-rendir', v.estado === 'REGRESADO' && Auth.can('mayorista.rendir'));
      $('modal-viaje').hidden = false;
    } catch (e) { alert(e.message); }
  }

  async function accion(ruta, confirmacion) {
    if (confirmacion && !confirm(confirmacion)) return;
    try {
      await api(`/api/v1/mayorista/viajes/${actual.id}/${ruta}`, { method: 'POST' });
      await cargar();
      await abrir(actual.id);
    } catch (e) { alert(e.message); }
  }

  async function cargarPedido(pid) {
    try {
      await api(`/api/v1/mayorista/pedidos/${pid}/cargar-camioneta`, { method: 'POST', body: { viaje_id: actual.id } });
      await abrir(actual.id);
    } catch (e) { alert(e.message); }
  }

  async function quitar(pid) {
    const motivo = prompt('Motivo para quitarlo del viaje:', 'Quitado del viaje');
    if (!motivo) return;
    try {
      await api(`/api/v1/mayorista/pedidos/${pid}/no-entregado`, { method: 'POST', body: { motivo } });
      await abrir(actual.id);
    } catch (e) { alert(e.message); }
  }

  // ---------- Rendición ----------
  function abrirRendicion() {
    $('r-info').innerHTML = `Efectivo que debería entregar <b>${esc(actual.encargado)}</b>: <b>$ ${fmt(actual.efectivo_por_rendir)}</b>`;
    $('r-contado').value = '';
    $('r-obs').value = '';
    $('modal-rendir').hidden = false;
    $('r-contado').focus();
  }

  async function confirmarRendicion() {
    if ($('r-contado').value === '') { alert('Ingresá el efectivo contado.'); return; }
    if (!confirm('¿Confirmar la rendición? Queda registrado que vos recibiste este dinero.')) return;
    try {
      const r = await api(`/api/v1/mayorista/viajes/${actual.id}/rendir`, { method: 'POST', body: {
        efectivo_contado: Number($('r-contado').value), observaciones: $('r-obs').value
      } });
      $('modal-rendir').hidden = true;
      alert(r.diferencia === 0 ? 'Rendición exacta.' : `Rendición registrada con diferencia de $ ${fmt(r.diferencia)}.`);
      await cargar();
      await abrir(actual.id);
    } catch (e) { alert(e.message); }
  }

  window.__viajes = { abrir, cargarPedido, quitar };

  $('btn-nuevo').addEventListener('click', abrirNuevo);
  $('n-ok').addEventListener('click', crear);
  ['n-close', 'n-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-nuevo').hidden = true)));
  $('v-close').addEventListener('click', () => ($('modal-viaje').hidden = true));
  $('v-salir').addEventListener('click', () => accion('salir', '¿Confirmar la salida? Ya no se podrán cargar más pedidos en este viaje.'));
  $('v-regresar').addEventListener('click', () => accion('regresar'));
  $('v-cancelar').addEventListener('click', () => accion('cancelar', '¿Cancelar este viaje?'));
  $('v-rendir').addEventListener('click', abrirRendicion);
  $('r-ok').addEventListener('click', confirmarRendicion);
  ['r-close', 'r-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-rendir').hidden = true)));
  $('filtro-estado').addEventListener('change', cargar);
  $('btn-logout').addEventListener('click', () => Auth.logout());

  (async function iniciar() {
    const user = await Auth.init('mayorista.ver|mayorista.cargar_camioneta|mayorista.entregar|mayorista.rendir');
    if (!user) return;
    Auth.renderSidebar('mayorista-viajes.html');
    $('user-display').textContent = `${user.nombre} ${user.apellido || ''}`;
    await cargar();
  })();
});