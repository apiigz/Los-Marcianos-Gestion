import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCobros } from './calculo.cuenta.mjs';

const medios = ['EFECTIVO', 'TRANSFERENCIA'];

test('cobro en efectivo válido', () => {
  const r = normalizarCobros([{ medio: 'efectivo', monto: '1500.5' }], { medios, tope: 2000 });
  assert.equal(r.total, 1500.5);
  assert.equal(r.cobros[0].medio, 'EFECTIVO');
});

test('medio no habilitado', () => {
  assert.throws(() => normalizarCobros([{ medio: 'DEBITO', monto: 10 }], { medios }), { status: 400 });
});

test('la transferencia exige cuenta destino', () => {
  assert.throws(() => normalizarCobros([{ medio: 'TRANSFERENCIA', monto: 10 }], { medios }), { status: 400 });
});

test('no se puede cobrar más de lo que falta en un pedido', () => {
  assert.throws(() => normalizarCobros([{ medio: 'EFECTIVO', monto: 3000 }], { medios, tope: 2000 }), { status: 400 });
});

test('el pago suelto no tiene tope', () => {
  assert.equal(normalizarCobros([{ medio: 'EFECTIVO', monto: 999999 }], { medios }).total, 999999);
});

test('monto cero o negativo', () => {
  assert.throws(() => normalizarCobros([{ medio: 'EFECTIVO', monto: 0 }], { medios }), { status: 400 });
  assert.throws(() => normalizarCobros([{ medio: 'EFECTIVO', monto: -5 }], { medios }), { status: 400 });
});