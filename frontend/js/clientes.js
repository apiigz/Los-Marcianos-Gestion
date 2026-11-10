document.addEventListener('DOMContentLoaded', () => {
  let clientes = [];
  let editandoId = null;

  const tbody = document.getElementById('clientes-tbody');
  const userDisplay = document.getElementById('user-display');
  const inputBuscar = document.getElementById('input-buscar');
  const chkInactivos = document.getElementById('chk-inactivos');
  const modal = document.getElementById('modal-cliente');
  const form = document.getElementById('form-cliente');

  const IVA_TXT = {
    RESPONSABLE_INSCRIPTO: 'Resp. inscripto', MONOTRIBUTO: 'Monotributo',
    EXENTO: 'Exento', CONSUMIDOR_FINAL: 'Consumidor final'
  };

  const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const fmtCuit = (c) => (c && c.length === 11) ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : (c || '-');
  const fmtMoneda = (n) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function cargar() {
    try {
      const res = await fetch('/api/v1/clientes', { credentials: 'include' });
      if (!res.ok) throw new Error('No se pudieron obtener los clientes');
      clientes = await res.json();
      render();
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:#ef4444;">Error al cargar clientes.</td></tr>`;
    }
  }

  function render() {
    const q = inputBuscar.value.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, '');

    const lista = clientes.filter(c => {
      if (!chkInactivos.checked && !c.activo) return false;
      if (!q) return true;
      return c.razon_social.toLowerCase().includes(q)
        || (qDigitos && (c.cuit || '').includes(qDigitos))
        || (qDigitos && (c.telefono || '').replace(/\D/g, '').includes(qDigitos));
    });

    tbody.innerHTML = '';
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem;">No hay clientes que coincidan.</td></tr>`;
      return;
    }

    const puedeEditar = Auth.can('cliente.gestionar');

    lista.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.id}</td>
        <td><strong>${escapeHtml(c.razon_social)}</strong>
            ${c.observaciones ? `<br><small class="helper-text">${escapeHtml(c.observaciones)}</small>` : ''}</td>
        <td style="font-family:monospace;">${fmtCuit(c.cuit)}</td>
        <td>${IVA_TXT[c.condicion_iva] || c.condicion_iva}</td>
        <td>${escapeHtml(c.telefono || '-')}</td>
        <td style="text-align:right; font-family:monospace;">
          ${c.limite_credito === null ? '<span class="helper-text">Sin límite</span>' : '$ ' + fmtMoneda(c.limite_credito)}
        </td>
        <td style="text-align:center;"><span class="status-indicator ${c.activo ? 'status-active' : 'status-inactive'}"></span></td>
        <td class="row-actions-cell">
          ${puedeEditar ? `
            <button type="button" class="btn-row-menu" onclick="event.stopPropagation(); window.__clientes.toggle(${c.id})">&#8942;</button>
            <div id="dd-${c.id}" class="row-dropdown-menu" hidden>
              <button type="button" class="menu-item menu-item-edit" onclick="window.__clientes.editar(${c.id})">Modificar</button>
              <button type="button" class="menu-item menu-item-delete" onclick="window.__clientes.cambiarEstado(${c.id})">${c.activo ? 'Desactivar' : 'Activar'}</button>
            </div>` : ''}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  function abrirModal(c = null) {
    editandoId = c ? c.id : null;
    document.getElementById('modal-cliente-titulo').textContent = c ? 'Modificar cliente' : 'Nuevo cliente';
    document.getElementById('f-razon').value = c?.razon_social || '';
    document.getElementById('f-cuit').value = c?.cuit ? fmtCuit(c.cuit) : '';
    document.getElementById('f-iva').value = c?.condicion_iva || 'CONSUMIDOR_FINAL';
    document.getElementById('f-telefono').value = c?.telefono || '';
    document.getElementById('f-limite').value = c?.limite_credito ?? '';
    document.getElementById('f-direccion').value = c?.direccion || '';
    document.getElementById('f-obs').value = c?.observaciones || '';
    document.getElementById('f-activo').checked = c ? c.activo : true;
    modal.hidden = false;
    document.getElementById('f-razon').focus();
  }

  const cerrarModal = () => { modal.hidden = true; editandoId = null; };

  window.__clientes = {
    toggle: (id) => {
      document.querySelectorAll('.row-dropdown-menu').forEach(el => { if (el.id !== `dd-${id}`) el.hidden = true; });
      const t = document.getElementById(`dd-${id}`);
      if (t) t.hidden = !t.hidden;
    },
    editar: (id) => abrirModal(clientes.find(c => c.id === id)),
    cambiarEstado: async (id) => {
      const c = clientes.find(x => x.id === id);
      if (!c) return;
      if (!confirm(`¿${c.activo ? 'Desactivar' : 'Activar'} a "${c.razon_social}"?`)) return;
      try {
        const res = await fetch(`/api/v1/clientes/${id}/estado`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: !c.activo })
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error al cambiar el estado');
        await cargar();
      } catch (e) { alert(e.message); }
    }
  };

  document.addEventListener('click', () =>
    document.querySelectorAll('.row-dropdown-menu').forEach(el => (el.hidden = true)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const limite = document.getElementById('f-limite').value;
    const payload = {
      razon_social: document.getElementById('f-razon').value,
      cuit: document.getElementById('f-cuit').value,
      condicion_iva: document.getElementById('f-iva').value,
      telefono: document.getElementById('f-telefono').value,
      direccion: document.getElementById('f-direccion').value,
      limite_credito: limite === '' ? null : Number(limite),
      observaciones: document.getElementById('f-obs').value,
      activo: document.getElementById('f-activo').checked
    };

    try {
      const res = await fetch(editandoId ? `/api/v1/clientes/${editandoId}` : '/api/v1/clientes', {
        method: editandoId ? 'PUT' : 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error al guardar el cliente');
      cerrarModal();
      await cargar();
    } catch (err) { alert(err.message); }
  });

  document.getElementById('btn-add-cliente').addEventListener('click', () => abrirModal());
  document.getElementById('btn-modal-cliente-close').addEventListener('click', cerrarModal);
  document.getElementById('btn-cancel-cliente').addEventListener('click', cerrarModal);
  inputBuscar.addEventListener('input', render);
  chkInactivos.addEventListener('change', render);
  document.getElementById('btn-logout').addEventListener('click', () => Auth.logout());

  (async function iniciar() {
    const user = await Auth.init('cliente.gestionar|mayorista.ver|mayorista.vender');
    if (!user) return;
    Auth.renderSidebar('clientes.html');
    userDisplay.textContent = `${user.nombre} ${user.apellido || ''}`;
    await cargar();
  })();
});