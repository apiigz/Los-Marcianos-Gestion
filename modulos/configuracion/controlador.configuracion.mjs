import * as modelo from './modelo.configuracion.mjs';

// GET /configuracion/pos  → lo que necesita la terminal de ventas
export async function obtenerParaPOS(req, res) {
  try {
    const recargos = await modelo.obtenerRecargos();
    const u = req.user;
    res.json({
      ...recargos,
      puede_cambiar_recargo: u.es_admin || u.permisos.includes('venta.cambiar_recargo')
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al obtener la configuración' });
  }
}

// PUT /configuracion/recargos  { debito, credito, maximo }
export async function guardarRecargos(req, res) {
  const valido = (n) => Number.isFinite(n) && n >= 0 && n <= 100;
  const debito = Number(req.body.debito);
  const credito = Number(req.body.credito);
  const maximo = Number(req.body.maximo);

  if (![debito, credito, maximo].every(valido)) {
    return res.status(400).json({ error: 'Los porcentajes deben estar entre 0 y 100.' });
  }
  if (debito > maximo || credito > maximo) {
    return res.status(400).json({ error: 'El máximo no puede ser menor que los porcentajes por defecto.' });
  }
  try {
    await modelo.guardarRecargos({ debito, credito, maximo });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al guardar la configuración' });
  }
}