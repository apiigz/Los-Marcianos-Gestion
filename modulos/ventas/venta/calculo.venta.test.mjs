import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularPagos } from './calculo.venta.mjs';

const cfg = { debito: 10, credito: 10, maximo: 15 };
const experimentado = () => true;
const novato = () => false;

test('el vuelto NO suma al efectivo registrado', () => {
  const r = calcularPagos({ subtotal: 3200, pagos: [{ medio_pago: 'EFECTIVO', monto: 5000 }],
                            cfg, userId: 1, puede: novato });
  assert.equal(r.total, 3200);
  assert.equal(r.pagosFinal[0].monto, 3200);
});

test('recargo por defecto del 10% en débito', () => {
  const r = calcularPagos({ subtotal: 1000, pagos: [{ medio_pago: 'DEBITO', monto: 1000 }],
                            cfg, userId: 1, puede: novato });
  assert.equal(r.total, 1100);
  assert.equal(r.pagosFinal[0].recargo, 100);
});

test('novato no puede cambiar el recargo', () => {
  assert.throws(() => calcularPagos({ subtotal: 1000,
    pagos: [{ medio_pago: 'DEBITO', monto: 1000, recargo_porcentaje: 3 }], cfg, userId: 1, puede: novato }),
    { status: 403 });
});

test('experimentado cambia el recargo pero no supera el máximo', () => {
  const ok = calcularPagos({ subtotal: 1000,
    pagos: [{ medio_pago: 'DEBITO', monto: 1000, recargo_porcentaje: 5 }], cfg, userId: 7, puede: experimentado });
  assert.equal(ok.total, 1050);
  assert.equal(ok.pagosFinal[0].modificado_por, 7);
  assert.throws(() => calcularPagos({ subtotal: 1000,
    pagos: [{ medio_pago: 'DEBITO', monto: 1000, recargo_porcentaje: 50 }], cfg, userId: 7, puede: experimentado }),
    { status: 400 });
});

test('pago insuficiente', () => {
  assert.throws(() => calcularPagos({ subtotal: 1000, pagos: [{ medio_pago: 'EFECTIVO', monto: 0 }],
    cfg, userId: 1, puede: novato }), { status: 400 });
});