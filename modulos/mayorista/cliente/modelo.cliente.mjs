import pool from '../../bd/conexion.bd.mjs';
import { ErrorHttp } from '../../utils/errores.mjs';

function traducirError(e) {
  if (e.code === '23505' && e.constraint === 'uq_cliente_cuit') {
    return new ErrorHttp(409, 'Ya existe un cliente con ese CUIT.');
  }
  if (e.code === '23514') return new ErrorHttp(400, 'Hay un dato fuera de rango (revisá CUIT y límite de crédito).');
  return e;
}

export async function obtenerTodos() {
  const { rows } = await pool.query('SELECT * FROM cliente ORDER BY razon_social');
  return rows;
}

export async function obtenerUno(id) {
  const { rows } = await pool.query('SELECT * FROM cliente WHERE id = $1', [id]);
  return rows[0];
}

export async function crearUno(d) {
  try {
    const { rows } = await pool.query(`
      INSERT INTO cliente (razon_social, cuit, condicion_iva, telefono, direccion,
                           limite_credito, observaciones, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.razon_social, d.cuit, d.condicion_iva, d.telefono, d.direccion,
       d.limite_credito, d.observaciones, d.activo]);
    return rows[0];
  } catch (e) { throw traducirError(e); }
}

export async function actualizarUno(id, d) {
  try {
    const { rows } = await pool.query(`
      UPDATE cliente SET razon_social=$1, cuit=$2, condicion_iva=$3, telefono=$4, direccion=$5,
                         limite_credito=$6, observaciones=$7, activo=$8
      WHERE id=$9 RETURNING *`,
      [d.razon_social, d.cuit, d.condicion_iva, d.telefono, d.direccion,
       d.limite_credito, d.observaciones, d.activo, id]);
    return rows[0];
  } catch (e) { throw traducirError(e); }
}

export async function cambiarEstado(id, activo) {
  const { rows } = await pool.query(
    'UPDATE cliente SET activo = $1 WHERE id = $2 RETURNING *', [activo, id]);
  return rows[0];
}