document.addEventListener('DOMContentLoaded', () => {
  let pedidos = [];
  let clientes = [];
  let opciones = { sucursales: [], sucursal_por_defecto_id: null, canales: [] };
  let carrito = [];          // { producto_id, descripcion, codigo_interno, precio, cantidad }
  let editandoId = null;     // null = pedido nuevo
  let detalleActual = null;
  let debounce = null;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const fmt = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fecha = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '-' : d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  };

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || data.message || 'Error en la solicitud');
      err.codigo = data.codigo;
      throw err;
    }
    return data;
  }

  // ---------- Listado ----------
  async function cargarPedidos() {
    try {
      const estado = $('filtro-estado').value;
      pedidos = await api('/api/v1/mayorista/pedidos' + (estado ? `?estado=${estado}` : ''));
      renderLista();
    } catch (e) {
      $('pedidos-tbody').innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#ef4444;">${escapeHtml(e.message)}</td></tr>`;
    }
  }

  function renderLista() {
    const tb = $('pedidos-tbody');
    if (!pedidos.length) {
      tb.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem;">No hay pedidos.</td></tr>`;
      return;
    }
    tb.innerHTML = pedidos.map(p => `
      <tr style="cursor:pointer;" onclick="window.__pedidos.ver(${p.id})">
        <td style="font-family:monospace;">#${String(p.remito_numero).padStart(6, '0')}</td>
        <td><strong>${escapeHtml(p.cliente)}</strong></td>
        <td>${escapeHtml(p.canal)}</td>
        <td>${escapeHtml(p.sucursal)}</td>
        <td><span class="estado estado-${p.estado}">${p.estado}</span></td>
        <td>${escapeHtml(p.creado_por_nombre)}</td>
        <td>${fecha(p.created_at)}</td>
        <td style="text-align:right; font-family:monospace;">$ ${fmt(p.total)}</td>
      </tr>`).join('');
  }

  // ---------- Carrito ----------
  function renderCarrito() {
    const tb = $('p-items');
    if (!carrito.length) {
      tb.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1rem; color:var(--text-subtle);">Agregá productos arriba.</td></tr>`;
    } else {
      tb.innerHTML = carrito.map((l, i) => `
        <tr>
          <td><strong>${escapeHtml(l.descripcion)}</strong>
              ${l.codigo_interno ? `<br><small class="helper-text">INT ${escapeHtml(l.codigo_interno)}</small>` : ''}</td>
          <td><input type="number" class="table-input" min="0.001" step="any" value="${l.cantidad}"
                     onchange="window.__pedidos.cambiarCant(${i}, this.value)"></td>
          <td style="text-align:right; font-family:monospace;">$ ${fmt(l.precio)}</td>
          <td style="text-align:right; font-family:monospace;">$ ${fmt(l.precio * l.cantidad)}</td>
          <td><button type="button" class="btn-inline-cancel" onclick="window.__pedidos.quitar(${i})">&times;</button></td>
        </tr>`).join('');
    }
    // Informativo: el servidor recalcula con los precios reales al guardar
    $('p-total').textContent = '$ ' + fmt(carrito.reduce((a, l) => a + l.precio * l.cantidad, 0));
  }

  function agregar(prod, cantidad) {
    const precio = Number(prod.precio_mayorista);
    if (!(precio > 0)) { alert(`"${prod.descripcion}" no tiene precio mayorista cargado.`); return; }
    const existente = carrito.find(l => l.producto_id === prod.id);
    if (existente) existente.cantidad = Number((existente.cantidad + cantidad).toFixed(3));
    else carrito.push({ producto_id: prod.id, descripcion: prod.descripcion,
                        codigo_interno: prod.codigo_interno, precio, cantidad });
    renderCarrito();
  }

  // "015", "7791234" o "015*16"
  function interpretarEntrada(texto) {
    const t = String(texto || '').trim();
    if (!t) return null;
    if (!t.includes('*')) return { codigo: t, cantidad: 1 };
    const m = t.match(/^([^*]+?)\s*\*\s*(\d+(?:[.,]\d{1,3})?)$/);
    if (!m) return { error: 'Formato inválido. Usá código*cantidad, por ejemplo 015*16.' };
    const cantidad = parseFloat(m[2].replace(',', '.'));
    if (!(cantidad > 0) || cantidad > 99999) return { error: 'La cantidad debe ser mayor a 0.' };
    return { codigo: m[1].trim(), cantidad };
  }

  $('p-buscar').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const entrada = interpretarEntrada($('p-buscar').value);
    if (!entrada) return;
    if (entrada.error) { alert(entrada.error); return; }
    try {
      const prod = await api(`/api/v1/productos/codigo/${encodeURIComponent(entrada.codigo)}?lista=mayorista`);
      agregar(prod, entrada.cantidad);
      $('p-buscar').value = '';
      $('p-sugerencias').hidden = true;
    } catch {
      alert(`No se encontró "${entrada.codigo}" (inexistente, inactivo o fuera de la lista mayorista).`);
      $('p-buscar').select();
    }
  });

  $('p-buscar').addEventListener('input', () => {
    const q = $('p-buscar').value.trim();
    clearTimeout(debounce);
    if (q.length < 2 || /^\d+$/.test(q) || q.includes('*')) { $('p-sugerencias').hidden = true; return; }
    debounce = setTimeout(async () => {
      try {
        const lista = await api(`/api/v1/productos/buscar?q=${encodeURIComponent(q)}&lista=mayorista`);
        const ul = $('p-sugerencias');
        ul.innerHTML = lista.map((p, i) =>
          `<li data-i="${i}"><span>${escapeHtml(p.descripcion)}</span><b>$ ${fmt(p.precio_mayorista)}</b></li>`).join('');
        ul.hidden = !lista.length;
        ul.onclick = (ev) => {
          const li = ev.target.closest('li');
          if (!li) return;
          agregar(lista[Number(li.dataset.i)], 1);
          $('p-buscar').value = '';
          ul.hidden = true;
          $('p-buscar').focus();
        };
      } catch { $('p-sugerencias').hidden = true; }
    }, 250);
  });

  // ---------- Modal de pedido ----------
  function llenarSelect(sel, items, valor, texto, elegido) {
    sel.innerHTML = items.map(i =>
      `<option value="${escapeHtml(i[valor])}" ${String(i[valor]) === String(elegido) ? 'selected' : ''}>${escapeHtml(i[texto])}</option>`).join('');
  }

  function abrirNuevo() {
    editandoId = null;
    carrito = [];
    $('modal-pedido-titulo').textContent = 'Nuevo pedido';
    llenarSelect($('p-cliente'), clientes.filter(c => c.activo), 'id', 'razon_social');
    llenarSelect($('p-canal'), opciones.canales.map(c => ({ v: c, t: c })), 'v', 't');
    llenarSelect($('p-sucursal'),
      opciones.sucursales.map(s => ({ id: s.id, n: s.nombre + (s.es_deposito_central ? ' (depósito central)' : '') })),
      'id', 'n', opciones.sucursal_por_defecto_id);
    ['p-cliente', 'p-canal', 'p-sucursal', 'p-obs'].forEach(id => ($(id).disabled = false));
    $('p-obs').value = '';
    renderCarrito();
    $('modal-pedido').hidden = false;
    $('p-buscar').focus();
  }

  function abrirEdicion(p) {
    editandoId = p.id;
    carrito = p.items.map(i => ({
      producto_id: i.producto_id, descripcion: i.descripcion, codigo_interno: i.codigo_interno,
      precio: Number(i.precio_unitario), cantidad: Number(i.cantidad)
    }));
    $('modal-pedido-titulo').textContent = `Modificar renglones · remito #${String(p.remito_numero).padStart(6, '0')}`;
    llenarSelect($('p-cliente'), [{ id: p.cliente_id, razon_social: p.cliente }], 'id', 'razon_social');
    llenarSelect($('p-canal'), [{ v: p.canal, t: p.canal }], 'v', 't');
    llenarSelect($('p-sucursal'), [{ id: p.sucursal_origen_id, n: p.sucursal }], 'id', 'n');
    $('p-obs').value = p.observaciones || '';
    ['p-cliente', 'p-canal', 'p-sucursal', 'p-obs'].forEach(id => ($(id).disabled = true));
    renderCarrito();
    $('modal-detalle').hidden = true;
    $('modal-pedido').hidden = false;
    $('p-buscar').focus();
  }

  async function guardarPedido() {
    if (!carrito.length) { alert('Agregá al menos un producto.'); return; }
    const articulos = carrito.map(l => ({ producto_id: l.producto_id, cantidad: l.cantidad }));
    try {
      if (editandoId) {
        await api(`/api/v1/mayorista/pedidos/${editandoId}/items`, { method: 'PUT', body: { articulos } });
      } else {
        await api('/api/v1/mayorista/pedidos', { method: 'POST', body: {
          cliente_id: Number($('p-cliente').value), canal: $('p-canal').value,
          sucursal_origen_id: Number($('p-sucursal').value),
          observaciones: $('p-obs').value, articulos
        } });
      }
      $('modal-pedido').hidden = true;
      await cargarPedidos();
    } catch (e) { alert(e.message); }
  }

  // ---------- Detalle ----------
  async function verDetalle(id) {
    try {
      const p = await api(`/api/v1/mayorista/pedidos/${id}`);
      detalleActual = p;
      $('d-titulo').textContent = `Remito #${String(p.remito_numero).padStart(6, '0')} · ${p.cliente}`;
      $('d-body').innerHTML = `
        <p style="margin-bottom:.75rem;">
          <span class="estado estado-${p.estado}">${p.estado}</span>
          &nbsp; Canal: <b>${escapeHtml(p.canal)}</b> · Despacha: <b>${escapeHtml(p.sucursal)}</b> ·
          Cargó: <b>${escapeHtml(p.creado_por_nombre)}</b>
          ${p.observaciones ? `<br><small class="helper-text">${escapeHtml(p.observaciones)}</small>` : ''}
        </p>
        <div class="table-container" style="max-height:240px;">
          <table class="users-table">
            <thead><tr><th>Producto</th><th style="text-align:right;">Cant.</th>
              <th style="text-align:right;">Precio</th><th style="text-align:right;">Subtotal</th></tr></thead>
            <tbody>${p.items.map(i => `
              <tr><td>${escapeHtml(i.descripcion)}</td>
                  <td style="text-align:right;">${Number(i.cantidad)}</td>
                  <td style="text-align:right; font-family:monospace;">$ ${fmt(i.precio_unitario)}</td>
                  <td style="text-align:right; font-family:monospace;">$ ${fmt(i.subtotal)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <p class="total-box" style="text-align:right; margin:.75rem 0;">Total: $ ${fmt(p.total)}</p>
        <h4 style="font-size:.75rem; text-transform:uppercase; color:var(--text-subtle); margin-bottom:.4rem;">Historial</h4>
        ${p.eventos.map(ev => `
          <div class="evento"><b>${escapeHtml(ev.tipo)}</b> · ${escapeHtml(ev.usuario)} · ${fecha(ev.created_at)}
            ${ev.detalle ? `<br>${escapeHtml(ev.detalle)}` : ''}</div>`).join('')}`;

      const pendiente = p.estado === 'PENDIENTE';
      const preparado = p.estado === 'PREPARADO';
      $('d-editar').style.display = pendiente && Auth.can('mayorista.vender') ? '' : 'none';
      $('d-preparar').style.display = pendiente && Auth.can('mayorista.preparar') ? '' : 'none';
      $('d-cancelar').style.display =
        (pendiente && Auth.canAny(['mayorista.vender', 'mayorista.preparar'])) ||
        (preparado && Auth.can('mayorista.preparar')) ? '' : 'none';
      $('modal-detalle').hidden = false;
    } catch (e) { alert(e.message); }
  }

    $('d-preparar').addEventListener('click', async () => {
    if (!detalleActual) return;
    if (!confirm('¿Marcar como PREPARADO? Se descuenta ahora la mercadería del stock de la sucursal de despacho.')) return;
    const url = `/api/v1/mayorista/pedidos/${detalleActual.id}/preparar`;
    try {
      await api(url, { method: 'POST' });
      alert('Pedido preparado. Stock descontado.');
    } catch (e) {
      if (e.codigo === 'STOCK_INSUFICIENTE' && Auth.can('mayorista.preparar_sin_stock')) {
        const motivo = prompt(`${e.message}\n\n¿Preparar igual? El stock quedará negativo y se deja constancia.\nEscribí el motivo (ej: llegó mercadería sin cargar):`);
        if (!motivo) return;
        try {
          await api(url, { method: 'POST', body: { forzar: true, motivo } });
          alert('Pedido preparado SIN stock suficiente. Quedó registrado en el historial.');
        } catch (e2) { alert(e2.message); return; }
      } else {
        alert(e.message);
        return;
      }
    }
    await cargarPedidos();
    await verDetalle(detalleActual.id);
  });

  $('d-cancelar').addEventListener('click', async () => {
    if (!detalleActual) return;
    const motivo = prompt(detalleActual.estado === 'PREPARADO'
      ? 'Motivo de la cancelación (el stock se repone):' : 'Motivo de la cancelación:');
    if (!motivo) return;
    try {
      await api(`/api/v1/mayorista/pedidos/${detalleActual.id}/cancelar`, { method: 'POST', body: { motivo } });
      await cargarPedidos();
      await verDetalle(detalleActual.id);
    } catch (e) { alert(e.message); }
  });

  $('d-editar').addEventListener('click', () => detalleActual && abrirEdicion(detalleActual));

  window.__pedidos = {
    ver: verDetalle,
    quitar: (i) => { carrito.splice(i, 1); renderCarrito(); },
    cambiarCant: (i, v) => {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) carrito[i].cantidad = n;
      renderCarrito();
    }
  };

  $('btn-nuevo').addEventListener('click', abrirNuevo);
  $('btn-pedido-guardar').addEventListener('click', guardarPedido);
  ['btn-pedido-close', 'btn-pedido-cancel'].forEach(id => $(id).addEventListener('click', () => ($('modal-pedido').hidden = true)));
  $('btn-detalle-close').addEventListener('click', () => ($('modal-detalle').hidden = true));
  $('filtro-estado').addEventListener('change', cargarPedidos);
  $('btn-logout').addEventListener('click', () => Auth.logout());

  (async function iniciar() {
    const user = await Auth.init('mayorista.ver|mayorista.vender|mayorista.preparar');
    if (!user) return;
    Auth.renderSidebar('mayorista-pedidos.html');
    $('user-display').textContent = `${user.nombre} ${user.apellido || ''}`;
    try {
      opciones = await api('/api/v1/mayorista/pedidos/opciones');
      if (Auth.canAny(['mayorista.vender', 'cliente.gestionar', 'mayorista.ver'])) {
        clientes = await api('/api/v1/clientes');
      }
    } catch (e) { console.warn(e); }
    await cargarPedidos();
  })();
});