// frontend/js/auth.js
const MENU_ADMIN = [
  ['usuarios.html',    'Usuarios',            'usuarios.gestionar'],
  ['roles.html',       'Roles',               'roles.gestionar|usuarios.gestionar'],
  ['sucursales.html',  'Sucursales',          'sucursales.gestionar'],
  ['productos.html',   'Productos',           'productos.ver'],
  ['categorias.html',  'Categorías',          'productos.ver|categorias.gestionar'],
  ['proveedores.html', 'Proveedores',         'productos.ver|proveedores.gestionar'],
  ['stock.html',       'Stock por sucursal',  'stock.ver'],
  ['turnos.html',      'Turnos',              'turno.ver_todos'],
  ['ventas-admin.html','Ventas',              'ventas.ver_todas'],
  ['estadisticas.html','Estadísticas',        'estadisticas.ver'],
];

window.Auth = {
  user: null,

  async init(permisoRequerido) {
    let res;
    try { res = await fetch('/api/v1/auth/me', { credentials: 'include' }); }
    catch { alert('Sin conexión con el servidor.'); return null; }

    if (!res.ok) { location.replace('index.html'); return null; }
    this.user = (await res.json()).user;

    if (permisoRequerido && !this.canAny(permisoRequerido.split('|'))) {
      alert('No tenés permisos para acceder a esta sección.');
      location.replace('index.html');
      return null;
    }
    this.aplicarVisibilidad();
    return this.user;
  },

  can(p)       { return !!this.user?.permisos?.includes(p); },
  canAny(lista){ return lista.some(p => this.can(p)); },

  // data-permiso="a|b" → visible si tiene a O b
  aplicarVisibilidad(root = document) {
    root.querySelectorAll('[data-permiso]').forEach(el => {
      el.style.display = this.canAny(el.dataset.permiso.split('|')) ? '' : 'none';
    });
  },

  // Un único menú para las 10 pantallas (evita editar 10 HTML cada vez)
  renderSidebar(activa, clase = 'nav-item') {
    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;
    nav.innerHTML = MENU_ADMIN
      .filter(([, , perm]) => this.canAny(perm.split('|')))
      .map(([href, txt]) => `<a href="${href}" class="${clase}${href === activa ? ' active' : ''}">${txt}</a>`)
      .join('');
  },

    async logout() {
    // Avisar la salida del turno solo si es un operador de caja
    if (this.can('pos.acceder')) {
      try { await fetch('/api/v1/turno_caja/salir', { method: 'POST', credentials: 'include' }); } catch {}
    }
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    location.replace('index.html');
  }
};