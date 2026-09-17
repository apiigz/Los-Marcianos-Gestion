document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pos-login-form');
  const inputDni = document.getElementById('dni');
  const inputPass = document.getElementById('password');
  const btnSubmit = document.getElementById('btn-login-submit');
  const btnTogglePass = document.getElementById('toggle-password-visibility');
  const eyeIcon = document.getElementById('eye-icon');

  // 1. Mostrar u ocultar la contraseña
  btnTogglePass?.addEventListener('click', () => {
    const esPassword = inputPass.getAttribute('type') === 'password';
    inputPass.setAttribute('type', esPassword ? 'text' : 'password');

    if (esPassword) {
      eyeIcon.innerHTML = `
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
        <line x1="2" x2="22" y1="2" y2="22"/>
      `;
    } else {
      eyeIcon.innerHTML = `
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
        <circle cx="12" cy="12" r="3"/>
      `;
    }
  });

  // 2. Envío de credenciales y redirección por rol
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const dni = inputDni.value.trim();
    const password = inputPass.value;

    if (!dni || !password) return;

    // Feedback visual en el botón
    const btnTextoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.7';
    btnSubmit.innerHTML = `<span>Validando credenciales...</span>`;

    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dni, password })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || data.error || 'Credenciales incorrectas');
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
        btnSubmit.innerHTML = btnTextoOriginal;
        inputPass.value = '';
        inputPass.focus();
        return;
      }

      // Redirección limpia según rol del backend
      if (data.rol === 'ADMINISTRADOR') {
        window.location.replace('admin.html');
      } else if (data.rol === 'CAJERO') {
        window.location.replace('ventas.html');
      } else {
        alert(`Rol no reconocido: ${data.rol}`);
        btnSubmit.disabled = false;
        btnSubmit.style.opacity = '1';
        btnSubmit.innerHTML = btnTextoOriginal;
      }

    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      alert('Error de conexión con el servidor POS.');
      btnSubmit.disabled = false;
      btnSubmit.style.opacity = '1';
      btnSubmit.innerHTML = btnTextoOriginal;
    }
  });
});