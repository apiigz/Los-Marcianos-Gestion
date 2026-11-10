import test from 'node:test';
import assert from 'node:assert/strict';
import { cuitValido, soloDigitos } from './cuit.mjs';

test('CUIT con dígito verificador correcto', () => {
  assert.equal(cuitValido('20-12345678-6'), true);
});

test('CUIT inválido', () => {
  assert.equal(cuitValido('20-12345678-9'), false);
  assert.equal(cuitValido('123'), false);
  assert.equal(cuitValido(''), false);
});

test('soloDigitos limpia guiones y espacios', () => {
  assert.equal(soloDigitos('20-12345678-6 '), '20123456786');
});