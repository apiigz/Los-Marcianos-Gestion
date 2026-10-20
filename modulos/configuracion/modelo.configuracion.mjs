import pool from '../bd/conexion.bd.mjs';

export async function obtenerRecargos() {
  const { rows } = await pool.query(
    "SELECT clave, valor FROM configuracion WHERE clave LIKE 'recargo.%'");
  const m = Object.fromEntries(rows.map(r => [r.clave, Number(r.valor)]));
  return {
    debito:  m['recargo.debito']  ?? 0,
    credito: m['recargo.credito'] ?? 0,
    maximo:  m['recargo.maximo']  ?? 0
  };
}

export async function guardarRecargos({ debito, credito, maximo }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upsert = `
      INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
      ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
    await client.query(upsert, ['recargo.debito',  String(debito)]);
    await client.query(upsert, ['recargo.credito', String(credito)]);
    await client.query(upsert, ['recargo.maximo',  String(maximo)]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}