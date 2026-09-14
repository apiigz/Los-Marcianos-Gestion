document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Verificar si hay sesión activa y obtener datos del usuario
    const res = await fetch('/api/v1/auth/me');

    if (!res.ok) {
      // Sesión expirada o no iniciada
      window.location.href = 'index.html';
      return;
    }

    const { user } = await res.json();

    // 2. Control de rol: solo administradores
    if (user.rol !== 'ADMINISTRADOR') {
      alert('Acceso restringido: no tienes permisos de administrador');
      window.location.href = 'index.html';
      return;
    }

    // 3. Opcional: mostrar saludo en la vista si tienes un elemento para ello
    const welcomeEl = document.getElementById('user-name');
    if (welcomeEl) {
      welcomeEl.textContent = `${user.nombre} ${user.apellido}`;
    }

  } catch (error) {
    console.error('Error de autenticación:', error);
    window.location.href = 'index.html';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Buscamos todos los enlaces del sidebar
  const navButtons = document.querySelectorAll('.sidebar-nav .nav-btn');

  navButtons.forEach(btn => {
    // Si el texto del botón es "Usuarios", le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'usuarios') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'usuarios.html';
      });
    }

    //Si el texto del botón es "Roles", le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'roles') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'roles.html';
      });
    }

    //Si el texto del botón es "Sucursales" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'sucursales') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'sucursales.html';
      });
    }

    //Si el texto del botón es "Productos" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'productos') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'productos.html';
      });
    }

    //Si el texto del botón es "Categorias" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'categorias') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'categorias.html';
      });
    }

    //Si el texto del botón es "proveedores" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'proveedores') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'proveedores.html';
      });
    }

    //Si el texto del botón es "Stock por Sucursal" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'stock por sucursal') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'stock.html';
      });
    }

    //Si el texto del botón es "Turnos" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'turnos') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'turnos.html';
      });
    }

    //Si el texto del botón es "Ventas" le asignamos la redirección
    if (btn.textContent.trim().toLowerCase() === 'ventas') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = 'ventas-admin.html';
      });
    }
  });
});

// Función global para el botón de cerrar sesión
async function cerrarSesion() {
  await fetch('/api/v1/auth/logout', { method: 'POST' });
  window.location.href = 'index.html';
}