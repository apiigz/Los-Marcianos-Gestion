import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularRendicion } from './calculo.viaje.mjs';

test('rendición exacta no pide observaciones', () => {
  const r = calcularRendicion(['1000.50', 2000], 3000.5, '');
  assert.equal(r.esperado, 3000.5);
  assert.equal(r.diferencia, 0);
});

test('con faltante la observación es obligatoria', () => {
  assert.throws(() => calcularRendicion([5000], 4800, ''), { status: 400 });
  const r = calcularRendicion([5000], 4800, 'Faltan 200: vuelto mal dado');
  assert.equal(r.diferencia, -200);
});

test('con sobrante también exige motivo', () => {
  assert.throws(() => calcularRendicion([100], 150, ''), { status: 400 });
  assert.equal(calcularRendicion([100], 150, 'Un cliente pagó de más').diferencia, 50);
});

test('un viaje sin efectivo se rinde en cero', () => {
  assert.equal(calcularRendicion([], 0, '').esperado, 0);
});

test('contado inválido', () => {
  assert.throws(() => calcularRendicion([100], -1, ''), { status: 400 });
  assert.throws(() => calcularRendicion([100], '', ''), { status: 400 });
  assert.throws(() => calcularRendicion([100], 'abc', ''), { status: 400 });
});