export const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');

// Validación del dígito verificador (módulo 11)
export function cuitValido(valor) {
  const c = soloDigitos(valor);
  if (!/^\d{11}$/.test(c)) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(c[i]), 0);
  let dv = 11 - (suma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) dv = 9;
  return dv === Number(c[10]);
}