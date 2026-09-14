import * as modelo from './modelo.sucursales.mjs';
import pool from "../../bd/conexion.bd.mjs";


export const obtenerTodos = async (req, res) => {
    try {
        const sucursales = await modelo.obtenerTodos();
        res.json(sucursales);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener las sucursales' });
    }
}

export const obtenerUno = async (req, res) => {
    try {
        const sucursal = await modelo.obtenerUno(req.params.id);
        res.json(sucursal);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener la sucursal' });
    }
}

export const crearUno = async (req, res) => {
    try {
        const sucursal = await modelo.crearUno(req.body);
        res.json(sucursal);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear la sucursal' });
    }
}

export const actualizarUno = async (req, res) => {
    const { id } = req.params;
  const { 
    nombre, 
    direccion, 
    punto_de_venta_arca, 
    es_deposito_central, 
    nuevo_deposito_central_id 
  } = req.body;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Actualizar los datos generales de la sucursal actual
    await client.query(`
      UPDATE sucursal 
      SET 
        nombre = $1, 
        direccion = $2, 
        punto_de_venta_arca = $3
      WHERE id = $4;
    `, [nombre.trim(), direccion.trim(), Number(punto_de_venta_arca), Number(id)]);

    // 2. Gestionar el estado de es_deposito_central según el escenario
    if (nuevo_deposito_central_id) {
      const nuevoId = Number(nuevo_deposito_central_id);
      const actualId = Number(id);

      // Desactivamos la sucursal actual
      await client.query(`
        UPDATE sucursal 
        SET es_deposito_central = false 
        WHERE id = $1;
      `, [actualId]);

      // Activamos obligatoriamente la nueva sucursal designada
      const resultadoNuevo = await client.query(`
        UPDATE sucursal 
        SET es_deposito_central = true 
        WHERE id = $1 
        RETURNING id, nombre, es_deposito_central;
      `, [nuevoId]);

      // Verificación de seguridad: si no afectó ninguna fila, lanzamos error para hacer ROLLBACK
      if (resultadoNuevo.rowCount === 0) {
        throw new Error(`No se encontró la sucursal con ID ${nuevoId} para asignarle el depósito central.`);
      }

    } else if (es_deposito_central === true) {
      // Si esta sucursal se marcó como TRUE, aseguramos que todas las demás sean FALSE
      await client.query(`
        UPDATE sucursal 
        SET es_deposito_central = false 
        WHERE id <> $1;
      `, [Number(id)]);

      await client.query(`
        UPDATE sucursal 
        SET es_deposito_central = true 
        WHERE id = $1;
      `, [Number(id)]);
    }

    await client.query('COMMIT');
    return res.status(200).json({ ok: true, mensaje: 'Sucursal actualizada con éxito' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar sucursal / reasignar depósito:', error);
    return res.status(500).json({ error: error.message || 'Error interno al actualizar sucursal' });
  } finally {
    client.release();
  }
}

export const eliminarUno = async (req, res) => {
    try {
        const sucursal = await modelo.eliminarUno(req.params.id);
        res.json(sucursal);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al eliminar la sucursal' });
    }
}