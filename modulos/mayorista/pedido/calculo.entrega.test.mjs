import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularEntrega, validarPendientes } from './calculo.entrega.mjs';

const items = [
  { producto_id: 1, cantidad: 10, precio_unitario: 100 },
  { producto_id: 2, cantidad: 4, precio_unitario: 50 }
];

test('sin detalle de entrega se asume entrega completa', () => {
  assert.deepEqual(calcularEntrega(items, undefined).faltantes, []);
});

test('entrega parcial genera faltantes', () => {
  const r = calcularEntrega(items, [{ producto_id: 1, cantidad: 6 }, { producto_id: 2, cantidad: 4 }]);
  assert.deepEqual(r.faltantes, [{ producto_id: 1, cantidad: 4, precio_unitario: 100 }]);
});

test('no se puede entregar más de lo pedido', () => {
  assert.throws(() => calcularEntrega(items, [{ producto_id: 1, cantidad: 11 }, { producto_id: 2, cantidad: 4 }]), { status: 400 });
});

test('no se puede omitir un renglón ni entregar nada', () => {
  assert.throws(() => calcularEntrega(items, [{ producto_id: 1, cantidad: 10 }]), { status: 400 });
  assert.throws(() => calcularEntrega(items, [{ producto_id: 1, cantidad: 0 }, { producto_id: 2, cantidad: 0 }]), { status: 400 });
});

test('pendientes: valida existencia, duplicados y cantidades', () => {
  const disp = [{ id: 7, cantidad_restante: 5 }];
  assert.deepEqual(validarPendientes(disp, [{ pendiente_id: 7, cantidad: 3 }]), [{ id: 7, cantidad: 3 }]);
  assert.throws(() => validarPendientes(disp, [{ pendiente_id: 8, cantidad: 1 }]), { status: 400 });
  assert.throws(() => validarPendientes(disp, [{ pendiente_id: 7, cantidad: 6 }]), { status: 400 });
  assert.throws(() => validarPendientes(disp, [{ pendiente_id: 7, cantidad: 1 }, { pendiente_id: 7, cantidad: 1 }]), { status: 400 });
});