document.querySelector('.login-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const dni = document.getElementById('dni').value.trim();
  const password = document.getElementById('password').value;

  try {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni, password })
    });

    const data = await response.json();

    if (!response.ok) {
      alert(data.message || 'Credenciales incorrectas');
      return;
    }

    // El backend setea la cookie automáticamente.
    // Redirigimos según el rol retornado:
    if (data.rol === 'ADMINISTRADOR') {
      window.location.href = 'admin.html';
    } else if (data.rol === 'CAJERO') {
      window.location.href = 'ventas.html';
    } else {
      alert(`Rol no reconocido: ${data.rol}`);
    }

  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    alert('Error al conectar con el servidor.');
  }
});

document.querySelector('nav-btn')