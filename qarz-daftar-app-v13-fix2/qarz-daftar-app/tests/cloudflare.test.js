'use strict';
// Cloudflare vaqtinchalik bulut (cloudflare/cloud.js) server.js bilan bir xil qoidalarda ishlashini tekshiradi.
process.env.QD_TEST = '1';
process.env.DATA_FILE = require('path').join(require('os').tmpdir(), 'qd-cf-test-' + process.pid + '.json');
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const srv = require('../server.js');

test('cloudflare/cloud.js: reconcile, rollar server.js bilan bir xil', async () => {
  const cf = await import(require('url').pathToFileURL(path.join(__dirname, '..', '..', '..', 'cloudflare', 'cloud.js')).href);
  const { reconcile, roleOf, hasPerm } = cf._test;
  for (const r of ['owner', 'manager', 'cashier', 'employee']) for (const p of ['write', 'edit', 'delete', 'lenders', 'staff', 'log']) assert.strictEqual(hasPerm(r, p), srv.hasPerm(r, p), r + ':' + p);
  assert.strictEqual(roleOf('a', { owner: 'a' }), srv.roleOf('a', { owner: 'a' }));
  assert.strictEqual(roleOf('b', { owner: 'a', role: 'cashier' }), srv.roleOf('b', { owner: 'a', role: 'cashier' }));
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const mk = () => Array.from({ length: rnd(5) }, (_, i) => ({ id: 'c' + rnd(6), name: 'N' + rnd(3), cur: 'UZS', transactions: Array.from({ length: rnd(4) }, () => ({ id: 't' + rnd(8), type: rnd(2) ? 'debt' : 'payment', amount: rnd(100) })) }));
  const del = () => Array.from({ length: rnd(3) }, () => ({ id: (rnd(2) ? 'c' : 't') + rnd(8), t: rnd(10), r: rnd(10) }));
  for (let i = 0; i < 300; i++) {
    const prev = { clients: mk(), lenders: mk(), del: del() }, next = { clients: mk(), lenders: mk(), del: del() };
    assert.deepStrictEqual(reconcile(prev, next), srv.reconcile(prev, next), 'holat ' + i);
  }
});
