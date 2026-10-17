const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, before, after } = require('node:test');
const ts = require('typescript');
const { Client } = require('pg');
const { closingSalesWhere } = require('../src/lib/closing-sales.cjs');
const { computeSummary: automatic } = require('./auto-cash-closing.cjs');

const source = fs.readFileSync(path.join(__dirname, '../src/app/api/pos/cash-closing/route.ts'), 'utf8');
const ast = ts.createSourceFile('route.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'computeSummary');
const compiled = ts.transpileModule(fn.getText(ast) + '\nexports.computeSummary = computeSummary;', {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const sandbox = { exports: {}, closingSalesWhere };
vm.runInNewContext(compiled, sandbox);
const manual = sandbox.exports.computeSummary;
const since = '2026-10-16T01:00:00.000Z';
const until = '2026-10-17T01:00:00.000Z';
let client;

before(async () => {
  if (!process.env.TEST_DATABASE_URL) return;
  client = new Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 10000 });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout='15s'");
});
after(async () => { if (client) { await client.query('ROLLBACK'); await client.end(); } });

test('shared predicate does not use kitchen progress and rejects unsafe aliases', () => {
  assert.doesNotMatch(closingSalesWhere(), /pending|preparing|ready|completed/);
  assert.match(closingSalesWhere(), /invoice_number IS NOT NULL/);
  assert.doesNotMatch(closingSalesWhere(), /card_payment_status/);
  assert.throws(() => closingSalesWhere('o; DROP TABLE orders'));
  assert.match(source, /closingSalesWhere\(\)/);
  assert.match(source, /\$24::timestamptz/);
});

test('automatic closing requires an explicit cutoff', async () => {
  await assert.rejects(automatic({}, since), /cutoff/);
});

function sale(id, changes = {}) {
  return { id, invoice_number: `S-2026/${String(id).padStart(6, '0')}`, status: 'pending',
    payment_method: 'card', card_payment_status: 'approved', total: 11, total_base: 10, total_vat: 1,
    business_unit: 'hicream', employee_id: 1, created_at: '2026-10-16T20:00:00Z', refund_reference: null, ...changes };
}

// JSON CTEs shadow all production tables. The connection itself is also read-only.
function fixtureClient(orders, refunds = [], suppliers = []) {
  const items = orders.map(o => ({ order_id: o.id, product_id: 1, qty: 1, unit_price: o.total, vat_rate: 10 }));
  const refundItems = refunds.map(r => ({ refund_id: r.id, qty: 1, unit_price: r.amount, vat_rate: 10 }));
  const cte = `WITH fixture_orders AS (SELECT * FROM jsonb_to_recordset($3::jsonb) AS x(
    id int,invoice_number text,status text,payment_method text,card_payment_status text,total numeric,
    total_base numeric,total_vat numeric,business_unit text,employee_id int,created_at timestamptz,refund_reference text)),
    fixture_order_items AS (SELECT * FROM jsonb_to_recordset($4::jsonb) AS x(order_id int,product_id int,qty numeric,unit_price numeric,vat_rate numeric)),
    fixture_refunds AS (SELECT * FROM jsonb_to_recordset($5::jsonb) AS x(id int,order_id int,status text,amount numeric,total_base numeric,total_vat numeric,completed_at timestamptz)),
    fixture_refund_items AS (SELECT * FROM jsonb_to_recordset($6::jsonb) AS x(refund_id int,qty numeric,unit_price numeric,vat_rate numeric)),
    fixture_supplier_payments AS (SELECT * FROM jsonb_to_recordset($7::jsonb) AS x(id int,supplier_name text,amount numeric,reason text,created_at timestamptz,status text)),
    fixture_employees AS (SELECT 1 AS id,'Test employee'::text AS name),
    fixture_products AS (SELECT 1 AS id,'Test product'::text AS name) `;
  return { query: async (sql, params) => {
    assert.match(sql.trim(), /^SELECT/i);
    assert.equal(JSON.stringify(params), JSON.stringify([since, until]));
    const rewritten = sql.replace(/pos\.(orders|order_items|refunds|refund_items|supplier_payments|employees|products)\b/g, 'fixture_$1');
    assert.doesNotMatch(rewritten, /\bpos\./);
    return client.query(cte + rewritten, [...params, ...[orders, items, refunds, refundItems, suppliers].map(JSON.stringify)]);
  } };
}

for (const [name, compute] of [['manual', manual], ['automatic', automatic]]) {
  const options = { skip: !process.env.TEST_DATABASE_URL };
  test(`${name}: paid pending KDS sale counts once in every kitchen state`, options, async () => {
    for (const status of ['pending', 'preparing', 'ready', 'completed']) {
      const result = await compute(fixtureClient([sale(1, { status })]), since, until);
      assert.equal(result.ticket_count, 1); assert.equal(result.total_sales, 11);
      assert.equal(result.total_card, 11); assert.equal(result.first_invoice, 'S-2026/000001');
    }
  });
  test(`${name}: excludes drafts, uncertain payments, cancelled, parked and other businesses`, options, async () => {
    const rows = [sale(1, { invoice_number: null }), sale(2, { invoice_number: null, card_payment_status: 'awaiting' }),
      sale(3, { invoice_number: null, card_payment_status: 'unknown' }), sale(4, { invoice_number: null, card_payment_status: 'failed' }),
      sale(5, { status: 'cancelled' }), sale(6, { payment_method: 'parked' }), sale(7, { business_unit: 'cookies' })];
    const result = await compute(fixtureClient(rows), since, until);
    assert.equal(result.ticket_count, 0); assert.equal(result.total_sales, 0); assert.equal(result.first_invoice, null);
  });
  test(`${name}: cash, manual and legacy invoiced card sales remain included`, options, async () => {
    const result = await compute(fixtureClient([sale(1, { payment_method: 'cash' }), sale(2, { payment_method: 'manual' }),
      sale(3, { card_payment_status: 'not_applicable' }), sale(4, { card_payment_status: null })]), since, until);
    assert.equal(result.total_sales, 44); assert.equal(result.total_cash, 11); assert.equal(result.total_card, 33);
  });
  test(`${name}: later payment lookup cannot silently remove an issued invoice`, options, async () => {
    const result = await compute(fixtureClient([sale(1, { card_payment_status: 'failed' })]), since, until);
    assert.equal(result.total_sales, 11); assert.equal(result.ticket_count, 1);
  });
  test(`${name}: exact start included and exact end excluded across midnight`, options, async () => {
    const result = await compute(fixtureClient([sale(1, { created_at: since }), sale(2, { created_at: until }),
      sale(3, { created_at: '2026-10-15T23:59:59Z' }), sale(4, { created_at: '2026-10-16T23:59:59Z' })]), since, until);
    assert.equal(result.ticket_count, 2); assert.equal(result.total_sales, 22);
    assert.equal(result.first_invoice, 'S-2026/000001'); assert.equal(result.last_invoice, 'S-2026/000004');
  });
  test(`${name}: refunds use refund date and supplier payouts do not reduce sales`, options, async () => {
    const refunds = [{ id: 1, order_id: 1, status: 'completed', amount: 5.5, total_base: 5, total_vat: 0.5, completed_at: '2026-10-16T21:00:00Z' },
      { id: 2, order_id: 2, status: 'completed', amount: 11, total_base: 10, total_vat: 1, completed_at: until },
      { id: 3, order_id: 2, status: 'pending_verification', amount: 11, total_base: 10, total_vat: 1, completed_at: since }];
    const result = await compute(fixtureClient([sale(1, { payment_method: 'cash', created_at: '2026-10-15T20:00:00Z' }), sale(2)], refunds,
      [{ id: 1, supplier_name: 'Test supplier', amount: 2, status: 'dispensed', created_at: since }]), since, until);
    assert.equal(result.ticket_count, 1); assert.equal(result.total_sales, 5.5); assert.equal(result.total_cash, -5.5);
    assert.equal(result.total_card, 11); assert.equal(result.total_refunded, 5.5); assert.equal(result.total_base, 5);
    assert.equal(result.total_vat, 0.5); assert.equal(result.expected_cash_after_supplier_payments, -7.5);
  });
}
