(function () {
  const $ = (id) => document.getElementById(id);
  const ctx = () => window.__pedidosCtx;

  let modo = 'entrega';      // 'entrega' | 'cobro'
  let ped = null;
  let cobros = [];
  let opciones = null;

  const remito = (p) => '#' + String(p.remito_numero).padStart(6, '0');

  async function cargarOpciones() {
    if (opciones) return;
    opciones = await ctx().api('/api/v1/mayorista/cuenta/opciones-cobro');
    // Sin permiso de verificación no se puede registrar una transferencia
    if (!opciones.puede_verificar) opciones.medios = opciones.medios.filter(m => m !== 'TRANSFERENCIA');
  }

  // Se llama desde verDetalle: agrega los cobros y muestra los botones según estado y permisos
  function pintar(p) {
    const { fmt, fecha, escapeHtml } = ctx();

    const html = `
      <h4 style="font-size:.75rem; text-transform:uppercase; color:var(--text-subtle); margin:.9rem 0 .4rem;">Cobros</h4>
      ${p.cobros.length ? p.cobros.map(c => `
        <div class="evento"><b>${escapeHtml(c.medio)}</b> $ ${fmt(c.monto)}
          ${c.cuenta ? `· ${escapeHtml(c.cuenta)}` : ''} ${c.referencia ? `· ${escapeHtml(c.referencia)}` : ''}
          · ${escapeHtml(c.cobrado_por)} · ${fecha(c.created_at)}</div>`).join('')
        : '<div class="evento">Sin cobros registrados.</div>'}
      <p style="margin-top:.5rem; font-size:.85rem;">Cobrado: <b>$ ${fmt(p.cobrado)}</b> ·
        Falta cobrar: <b>$ ${fmt(p.falta_cobrar)}</b>${p.estado === 'ENTREGADO' && p.falta_cobrar > 0 ? ' (en cuenta corriente)' : ''}</p>`;
    $('d-body').insertAdjacentHTML('beforeend', html);

    const can = (x) => Auth.can(x);
    const show = (id, v) => ($(id).style.display = v ? '' : 'none');
    show('d-entregar',  p.estado === 'EN_REPARTO' && can('mayorista.entregar'));
    show('d-nodisp',    p.estado === 'EN_REPARTO' && Auth.canAny(['mayorista.entregar', 'mayorista.cargar_camioneta']));
    show('d-cobrar',    ['PREPARADO', 'EN_REPARTO', 'ENTREGADO'].includes(p.estado) && p.falta_cobrar > 0
                        && Auth.canAny(['mayorista.entregar', 'mayorista.cobrar']));
  }

  // ---------- Modal ----------
  async function abrir(m) {
    try { await cargarOpciones(); } catch (e) { alert(e.message); return; }
    const { fmt, escapeHtml } = ctx();
    modo = m;
    ped = ctx().actual();
    cobros = [];

    $('e-titulo').textContent = `${m === 'entrega' ? 'Registrar entrega' : 'Registrar cobro'} · remito ${remito(ped)} · ${ped.cliente}`;
    $('e-sec-items').style.display = m === 'entrega' ? '' : 'none';
    $('e-sec-pend').style.display = (m === 'entrega' && ped.pendientes_cliente.length) ? '' : 'none';

    $('e-items').innerHTML = ped.items.map(i => `
      <tr><td>${escapeHtml(i.descripcion)}</td>
          <td style="text-align:right;">${Number(i.cantidad)}</td>
          <td><input type="number" class="table-input e-ent" data-pid="${i.producto_id}" data-pedida="${Number(i.cantidad)}"
                     min="0" max="${Number(i.cantidad)}" step="any" value="${Number(i.cantidad)}"></td></tr>`).join('');

    $('e-pend').innerHTML = ped.pendientes_cliente.map(p => `
      <tr><td>${escapeHtml(p.descripcion)}</td><td>#${String(p.remito_numero).padStart(6, '0')}</td>
          <td style="text-align:right;">${Number(p.cantidad_restante)}</td>
          <td><input type="number" class="table-input e-pen" data-id="${p.id}" min="0" max="${Number(p.cantidad_restante)}"
                     step="any" value="0"></td></tr>`).join('');

    $('e-medio').innerHTML = opciones.medios.map(x => `<option value="${x}">${x}</option>`).join('');
    $('e-cuenta').innerHTML = opciones.cuentas.map(c =>
      `<option value="${c.id}">${escapeHtml(c.nombre)}${c.alias ? ' · ' + escapeHtml(c.alias) : ''}</option>`).join('');
    $('e-monto').value = ped.falta_cobrar > 0 ? ped.falta_cobrar : '';
    $('e-ref').value = '';
    cuentaVisible();
    renderCobros();
    $('modal-entrega').hidden = false;
  }

  function cuentaVisible() {
    $('e-cuenta-wrap').style.display = $('e-medio').value === 'TRANSFERENCIA' ? '' : 'none';
  }

  function renderCobros() {
    const { fmt, escapeHtml } = ctx();
    const nuevos = cobros.reduce((a, c) => a + c.monto, 0);
    const queda = Math.round((ped.falta_cobrar - nuevos) * 100) / 100;

    $('e-cobros').innerHTML = cobros.length ? cobros.map((c, i) => `
      <tr><td>${c.medio}</td><td style="text-align:right;">$ ${fmt(c.monto)}</td>
          <td>${escapeHtml(c.referencia || '')}</td>
          <td><button type="button" class="btn-inline-cancel" onclick="window.__entrega.quitar(${i})">&times;</button></td></tr>`).join('') : '';

    $('e-resumen').innerHTML = `Total del pedido <b>$ ${fmt(ped.total)}</b> · ya cobrado <b>$ ${fmt(ped.cobrado)}</b> ·
      falta cobrar <b>$ ${fmt(ped.falta_cobrar)}</b><br>
      Con los cobros cargados queda en cuenta corriente: <b>$ ${fmt(queda)}</b>`;
  }

  function agregarCobro() {
    const monto = Number($('e-monto').value);
    const medio = $('e-medio').value;
    if (!(monto > 0)) { alert('Ingresá un monto mayor a 0.'); return false; }
    if (medio === 'TRANSFERENCIA' && !$('e-cuenta').value) { alert('Elegí la cuenta donde entró la transferencia.'); return false; }
    cobros.push({
      medio, monto,
      cuenta_cobro_id: medio === 'TRANSFERENCIA' ? Number($('e-cuenta').value) : null,
      referencia: $('e-ref').value.trim()
    });
    $('e-monto').value = '';
    $('e-ref').value = '';
    renderCobros();
    return true;
  }

  async function confirmar() {
    const { api } = ctx();

    // Si quedó un monto tipeado sin agregar, avisar para no perder un cobro sin querer
    if ($('e-monto').value && Number($('e-monto').value) > 0) {
      if (!confirm('Hay un monto escrito que no se agregó como cobro. ¿Continuar sin ese cobro?')) return;
    }

    try {
      if (modo === 'cobro') {
        if (!cobros.length) { alert('Agregá al menos un cobro.'); return; }
        await api(`/api/v1/mayorista/pedidos/${ped.id}/cobros`, { method: 'POST', body: { cobros } });
      } else {
        const entregas = [...document.querySelectorAll('.e-ent')].map(i => ({ producto_id: Number(i.dataset.pid), cantidad: Number(i.value) }));
        const pendientes = [...document.querySelectorAll('.e-pen')]
          .map(i => ({ pendiente_id: Number(i.dataset.id), cantidad: Number(i.value) })).filter(x => x.cantidad > 0);

        const hayFaltante = [...document.querySelectorAll('.e-ent')].some(i => Number(i.value) < Number(i.dataset.pedida));
        const aviso = hayFaltante
          ? 'ENTREGA PARCIAL: el cliente paga el pedido completo y lo que falta queda pendiente para su próxima entrega. ¿Confirmar?'
          : '¿Confirmar la entrega? Se carga el total a la cuenta del cliente.';
        if (!confirm(aviso)) return;

        await api(`/api/v1/mayorista/pedidos/${ped.id}/entregar`, { method: 'POST', body: { entregas, pendientes, cobros } });
      }
      $('modal-entrega').hidden = true;
      await ctx().recargar();
    } catch (e) { alert(e.message); }
  }

  window.__entrega = {
    pintar,
    quitar: (i) => { cobros.splice(i, 1); renderCobros(); }
  };

  $('e-medio').addEventListener('change', cuentaVisible);
  $('e-agregar').addEventListener('click', agregarCobro);
  $('e-confirmar').addEventListener('click', confirmar);
  ['e-close', 'e-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-entrega').hidden = true)));

  $('d-entregar').addEventListener('click', () => abrir('entrega'));
  $('d-cobrar').addEventListener('click', () => abrir('cobro'));

  $('d-nodisp').addEventListener('click', async () => {
    const p = ctx().actual();
    const motivo = p && prompt('¿Por qué no se pudo entregar? (ej: cliente ausente)');
    if (!motivo) return;
    try {
      await ctx().api(`/api/v1/mayorista/pedidos/${p.id}/no-entregado`, { method: 'POST', body: { motivo } });
      await ctx().recargar();
    } catch (e) { alert(e.message); }
  });
})();