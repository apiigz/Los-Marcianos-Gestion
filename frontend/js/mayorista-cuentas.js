document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmt = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = (iso) => { const d = new Date(iso); return isNaN(d) ? '-' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); };

  let cuentas = [];
  let det = null;
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

  const saldoHtml = (s) => {
    const n = Number(s);
    if (n > 0) return `<span class="debe">Debe $ ${fmt(n)}</span>`;
    if (n < 0) return `<span class="favor">A favor $ ${fmt(-n)}</span>`;
    return '<span class="helper-text">$ 0,00</span>';
  };

  // ---------- Lista ----------
  async function cargar() {
    try { cuentas = await api('/api/v1/mayorista/cuenta'); render(); }
    catch (e) { $('cuentas-tbody').innerHTML = `<tr><td colspan="3" style="color:#ef4444; padding:2rem; text-align:center;">${esc(e.message)}</td></tr>`; }
  }

  function render() {
    const q = $('buscar').value.trim().toLowerCase();
    const lista = cuentas.filter(c =>
      (!q || c.razon_social.toLowerCase().includes(q)) && (!$('solo-deuda').checked || Number(c.saldo) > 0));

    $('cuentas-tbody').innerHTML = lista.length ? lista.map(c => `
      <tr style="cursor:pointer;" onclick="window.__cuentas.abrir(${c.id})">
        <td><strong>${esc(c.razon_social)}</strong>${c.activo ? '' : ' <small class="helper-text">(inactivo)</small>'}</td>
        <td style="text-align:right;">${saldoHtml(c.saldo)}</td>
        <td style="text-align:right; font-family:monospace;">${c.limite_credito === null ? '<span class="helper-text">Sin límite</span>' : '$ ' + fmt(c.limite_credito)}</td>
      </tr>`).join('') : `<tr><td colspan="3" style="text-align:center; padding:2rem;">No hay cuentas.</td></tr>`;

    const deuda = cuentas.reduce((a, c) => a + Math.max(0, Number(c.saldo)), 0);
    $('total-deuda').textContent = `Total que te deben los clientes: $ ${fmt(deuda)}`;
  }

  // ---------- Detalle ----------
  async function abrir(id) {
    try {
      det = await api(`/api/v1/mayorista/cuenta/${id}`);
      const c = det.cliente;
      $('c-titulo').textContent = c.razon_social;

      $('c-body').innerHTML = `
        <div class="kpis">
          <div class="kpi"><small>Saldo</small><b>${saldoHtml(det.saldo)}</b></div>
          <div class="kpi"><small>Pedidos en curso</small><b>$ ${fmt(det.comprometido)}</b></div>
          <div class="kpi"><small>Límite</small><b>${c.limite_credito === null ? 'Sin límite' : '$ ' + fmt(c.limite_credito)}</b></div>
          <div class="kpi"><small>Disponible</small><b>${det.disponible === null ? '—' : '$ ' + fmt(det.disponible)}</b></div>
        </div>

        <h4 class="sec">Faltantes pendientes de entrega (ya cobrados)</h4>
        ${det.pendientes.length ? `<table class="users-table"><thead><tr><th>Producto</th><th>Remito</th>
          <th style="text-align:right;">Cantidad</th><th style="text-align:right;">Importe</th><th></th></tr></thead><tbody>
          ${det.pendientes.map(p => `<tr><td>${esc(p.descripcion)}</td><td>#${String(p.remito_numero).padStart(6, '0')}</td>
            <td style="text-align:right;">${Number(p.cantidad_restante)}</td>
            <td style="text-align:right;">$ ${fmt(Number(p.cantidad_restante) * Number(p.precio_unitario))}</td>
            <td>${Auth.can('mayorista.acreditar') ? `<button type="button" class="btn-inline-cancel" onclick="window.__cuentas.acreditar(${p.id})">Acreditar</button>` : ''}</td></tr>`).join('')}
          </tbody></table>` : '<p class="helper-text">No hay faltantes pendientes.</p>'}

        <h4 class="sec">Movimientos (últimos 300)</h4>
        <div class="table-container" style="max-height:300px;">
          <table class="users-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th>Usuario</th><th style="text-align:right;">Monto</th></tr></thead><tbody>
          ${det.movimientos.map(m => `<tr><td>${fecha(m.created_at)}</td><td>${m.tipo}</td><td>${esc(m.detalle || '')}</td>
            <td>${esc(m.usuario)}</td>
            <td style="text-align:right; font-family:monospace;" class="${Number(m.monto) > 0 ? 'debe' : 'favor'}">${Number(m.monto) > 0 ? '+' : '−'} $ ${fmt(Math.abs(m.monto))}</td></tr>`).join('')
            || '<tr><td colspan="5" style="text-align:center;">Sin movimientos.</td></tr>'}
          </tbody></table>
        </div>`;

      $('c-pago').style.display = Auth.can('mayorista.cobrar') ? '' : 'none';
      $('c-ajuste').style.display = Auth.can('mayorista.acreditar') ? '' : 'none';
      $('c-reembolso').style.display = (Number(det.saldo) < 0 && Auth.can('mayorista.reembolsar')) ? '' : 'none';
      $('modal-cuenta').hidden = false;
    } catch (e) { alert(e.message); }
  }

  async function acreditar(pid) {
    const motivo = prompt('Motivo (el cliente ya no va a recibir esta mercadería; se repone el stock y se le acredita el importe):');
    if (!motivo) return;
    try {
      const r = await api(`/api/v1/mayorista/pedidos/pendientes/${pid}/acreditar`, { method: 'POST', body: { motivo } });
      alert(`Acreditado $ ${fmt(r.importe)}.`);
      await cargar();
      await abrir(det.cliente.id);
    } catch (e) { alert(e.message); }
  }

  async function ajuste() {
    const monto = prompt('Monto del ajuste: positivo = el cliente debe más, negativo = se le descuenta.');
    if (monto === null || monto === '') return;
    const n = Number(String(monto).replace(',', '.'));
    if (!Number.isFinite(n) || n === 0) { alert('Monto inválido.'); return; }
    const motivo = prompt('Motivo del ajuste (queda registrado):');
    if (!motivo) return;
    try {
      await api(`/api/v1/mayorista/cuenta/${det.cliente.id}/ajustes`, { method: 'POST', body: { monto: n, motivo } });
      await cargar();
      await abrir(det.cliente.id);
    } catch (e) { alert(e.message); }
  }

  // ---------- Pago a cuenta ----------
  async function abrirPago() {
    try {
      if (!opciones) {
        opciones = await api('/api/v1/mayorista/cuenta/opciones-cobro');
        if (!opciones.puede_verificar) opciones.medios = opciones.medios.filter(m => m !== 'TRANSFERENCIA');
      }
    } catch (e) { alert(e.message); return; }
    $('p-medio').innerHTML = opciones.medios.map(m => `<option>${m}</option>`).join('');
    $('p-cuenta').innerHTML = opciones.cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.alias ? ' · ' + esc(c.alias) : ''}</option>`).join('');
    $('p-monto').value = det.saldo > 0 ? det.saldo : '';
    $('p-ref').value = '';
    cuentaVisible();
    $('modal-pago').hidden = false;
  }

  const cuentaVisible = () => ($('p-cuenta-wrap').style.display = $('p-medio').value === 'TRANSFERENCIA' ? '' : 'none');

  async function confirmarPago() {
    const monto = Number($('p-monto').value);
    if (!(monto > 0)) { alert('Ingresá un monto mayor a 0.'); return; }
    const medio = $('p-medio').value;
    try {
      const r = await api(`/api/v1/mayorista/cuenta/${det.cliente.id}/pagos`, { method: 'POST', body: { cobros: [{
        medio, monto, referencia: $('p-ref').value,
        cuenta_cobro_id: medio === 'TRANSFERENCIA' ? Number($('p-cuenta').value) : null
      }] } });
      $('modal-pago').hidden = true;
      alert(`Pago registrado. Saldo actual: ${Number(r.saldo) > 0 ? 'debe' : 'a favor'} $ ${fmt(Math.abs(r.saldo))}.`);
      await cargar();
      await abrir(det.cliente.id);
    } catch (e) { alert(e.message); }
  }

  
    // ---------- Devolución de saldo a favor ----------
  let reems = [];
  let reemActual = null;

  async function cargarReembolsos() {
    try {
      reems = await api('/api/v1/mayorista/cuenta/reembolsos?estado=PENDIENTE');
      $('reem-tbody').innerHTML = reems.length ? reems.map(r => `
        <tr><td>#${r.id}</td><td>${esc(r.razon_social)}</td><td>${r.medio}</td><td>${esc(r.motivo)}</td>
          <td style="text-align:right; font-family:monospace;">$ ${fmt(r.monto)}</td>
          <td style="white-space:nowrap;">
            ${Auth.can('mayorista.pagar_reembolso') ? `<button type="button" class="btn-inline-accept" onclick="window.__cuentas.pagarReem(${r.id})">Marcar pagada</button>` : ''}
            ${Auth.can('mayorista.reembolsar') ? `<button type="button" class="btn-inline-cancel" onclick="window.__cuentas.cancelarReem(${r.id})">Cancelar</button>` : ''}
          </td></tr>`).join('')
        : '<tr><td colspan="6" style="text-align:center; padding:1rem;">No hay devoluciones pendientes.</td></tr>';
    } catch (e) { $('reem-tbody').innerHTML = `<tr><td colspan="6" style="color:#ef4444;">${esc(e.message)}</td></tr>`; }
  }

  async function solicitarReembolso() {
    const aFavor = -Number(det.saldo);
    const monto = prompt(`Monto a devolver (el cliente tiene $ ${fmt(aFavor)} a favor):`, aFavor);
    if (monto === null || monto === '') return;
    const n = Number(String(monto).replace(',', '.'));
    if (!(n > 0)) { alert('Monto inválido.'); return; }
    const m = (prompt('Medio de devolución: escribí T para transferencia o E para efectivo', 'T') || '').trim().toUpperCase();
    const medio = m === 'T' ? 'TRANSFERENCIA' : m === 'E' ? 'EFECTIVO' : null;
    if (!medio) { alert('Medio inválido.'); return; }
    const motivo = prompt('Motivo (queda registrado):');
    if (!motivo) return;
    try {
      await api(`/api/v1/mayorista/cuenta/${det.cliente.id}/reembolsos`, { method: 'POST', body: { monto: n, medio, motivo } });
      alert('Devolución registrada. Se descontó del saldo; queda pendiente de transferir.');
      await cargar();
      await cargarReembolsos();
      await abrir(det.cliente.id);
    } catch (e) { alert(e.message); }
  }

  async function pagarReem(id) {
    reemActual = reems.find(r => r.id === id);
    if (!reemActual) return;
    if (!opciones) {
      try {
        opciones = await api('/api/v1/mayorista/cuenta/opciones-cobro');
      } catch (e) { alert(e.message); return; }
    }
    $('rp-info').innerHTML = `Devolver <b>$ ${fmt(reemActual.monto)}</b> a <b>${esc(reemActual.razon_social)}</b> por ${reemActual.medio}.`;
    $('rp-cuenta').innerHTML = opciones.cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}${c.alias ? ' · ' + esc(c.alias) : ''}</option>`).join('');
    $('rp-cuenta-wrap').style.display = reemActual.medio === 'TRANSFERENCIA' ? '' : 'none';
    $('rp-ref').value = '';
    $('modal-reem-pagar').hidden = false;
  }

  async function confirmarPagoReem() {
    try {
      await api(`/api/v1/mayorista/cuenta/reembolsos/${reemActual.id}/pagar`, { method: 'POST', body: {
        cuenta_cobro_id: reemActual.medio === 'TRANSFERENCIA' ? Number($('rp-cuenta').value) : null,
        referencia: $('rp-ref').value
      } });
      $('modal-reem-pagar').hidden = true;
      await cargarReembolsos();
    } catch (e) { alert(e.message); }
  }

  async function cancelarReem(id) {
    const motivo = prompt('Motivo de la cancelación (el saldo vuelve a favor del cliente):');
    if (!motivo) return;
    try {
      await api(`/api/v1/mayorista/cuenta/reembolsos/${id}/cancelar`, { method: 'POST', body: { motivo } });
      await cargar();
      await cargarReembolsos();
    } catch (e) { alert(e.message); }
  }

  window.__cuentas = { abrir, acreditar, pagarReem, cancelarReem };

  $('c-reembolso').addEventListener('click', solicitarReembolso);
  $('rp-ok').addEventListener('click', confirmarPagoReem);
  ['rp-close', 'rp-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-reem-pagar').hidden = true)));

  $('buscar').addEventListener('input', render);
  $('solo-deuda').addEventListener('change', render);
  $('c-close').addEventListener('click', () => ($('modal-cuenta').hidden = true));
  $('c-pago').addEventListener('click', abrirPago);
  $('c-ajuste').addEventListener('click', ajuste);
  $('p-medio').addEventListener('change', cuentaVisible);
  $('p-ok').addEventListener('click', confirmarPago);
  ['p-close', 'p-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-pago').hidden = true)));
  $('btn-logout').addEventListener('click', () => Auth.logout());

  (async function iniciar() {
    const user = await Auth.init('mayorista.ver|mayorista.cobrar|mayorista.reembolsar|mayorista.pagar_reembolso');
    if (!user) return;
    Auth.renderSidebar('mayorista-cuentas.html');
    $('user-display').textContent = `${user.nombre} ${user.apellido || ''}`;
    await cargar();
    await cargarReembolsos();
  })();
});