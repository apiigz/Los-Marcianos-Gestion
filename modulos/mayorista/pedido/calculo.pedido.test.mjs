import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparLineas, requerimientos } from './calculo.pedido.mjs';

test('junta renglones repetidos del mismo producto', () => {
  const r = agruparLineas([{ producto_id: 5, cantidad: 10 }, { producto_id: 5, cantidad: 6 }, { id: 7, cantidad: 1 }]);
  assert.deepEqual(r, [{ producto_id: 5, cantidad: 16 }, { producto_id: 7, cantidad: 1 }]);
});

test('rechaza cantidades inválidas', () => {
  assert.throws(() => agruparLineas([{ producto_id: 1, cantidad: 0 }]), { status: 400 });
  assert.throws(() => agruparLineas([{ producto_id: 1, cantidad: -3 }]), { status: 400 });
  assert.throws(() => agruparLineas([{ producto_id: 0, cantidad: 1 }]), { status: 400 });
});

test('un combo descuenta sus ingredientes, no a sí mismo', () => {
  const combos = new Map([[100, [{ producto_ingrediente_id: 1, cantidad: 2 }, { producto_ingrediente_id: 2, cantidad: 0.5 }]]]);
  const req = requerimientos([{ producto_id: 100, cantidad: 3 }, { producto_id: 1, cantidad: 4 }], combos);
  assert.equal(req.get(1), 10);
  assert.equal(req.get(2), 1.5);
  assert.equal(req.has(100), false);
});