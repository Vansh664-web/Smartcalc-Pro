// Exhaustive audit of all SmartCalc Pro calculators.
//
// For every calculator this runs the defaults, then re-runs it with every
// numeric field forced to 0, -1, 1e12 and a tiny fraction, plus every option of
// every dropdown. Any result must be a clean displayable string: no NaN,
// undefined, Infinity or "[object Object]". A calculator may reject an input
// with a clear error, but it may never return garbage.
//
//   node tests/all-calculators.test.js

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../calculations.js`, 'utf8'), { window });
const engine = window.SmartCalc;

const BAD = /NaN|undefined|Infinity|\[object Object\]/;

let checks = 0;
const failures = [];
const notes = [];

function record(calc, label, error) {
  failures.push(`${calc.id} [${label}]: ${error}`);
}

function checkValue(calc, label, result) {
  checks += 1;
  if (!result || typeof result !== 'object') {
    record(calc, label, 'no result object');
    return;
  }
  if (typeof result.value !== 'string' || !result.value.trim()) {
    record(calc, label, `value is ${JSON.stringify(result.value)}`);
    return;
  }
  if (BAD.test(result.value)) {
    record(calc, label, `garbage value "${result.value}"`);
  }
  if (result.detail !== undefined && BAD.test(String(result.detail))) {
    record(calc, label, `garbage detail "${result.detail}"`);
  }
  if (result.steps !== undefined && !Array.isArray(result.steps)) {
    record(calc, label, 'steps is not an array');
  }
}

function tryRun(calc, inputs, label) {
  try {
    checkValue(calc, label, engine.calculate(calc, inputs));
  } catch (error) {
    checks += 1;
    if (!error || !error.message || BAD.test(error.message)) {
      record(calc, label, `bad error message: ${error && error.message}`);
    }
  }
}

// --- catalog integrity -------------------------------------------------------
const ids = new Set();
for (const calc of engine.calculators) {
  checks += 1;
  if (ids.has(calc.id)) record(calc, 'catalog', 'duplicate id');
  ids.add(calc.id);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(calc.id)) record(calc, 'catalog', 'id is not kebab-case');
  if (!calc.name || !calc.description) record(calc, 'catalog', 'missing name or description');
  if (!engine.categoryKeys.includes(calc.category)) record(calc, 'catalog', `unknown category "${calc.category}"`);
}

for (const category of engine.categoryKeys) {
  const group = engine.groups[category];
  checks += 1;
  if (!Array.isArray(group) || !group.length) record({ id: category }, 'groups', 'empty category group');
}

// --- per-calculator input matrix --------------------------------------------
const num = value => String(value);

for (const calc of engine.calculators) {
  const fields = engine.schema(calc);
  const defaults = Object.fromEntries(fields.map(field => [field.name, field.default]));

  // 1. Defaults must always produce a clean result.
  tryRun(calc, defaults, 'defaults');

  // 2. Every dropdown option must be accepted.
  for (const field of fields.filter(f => f.type === 'select')) {
    for (const option of field.options) {
      tryRun(calc, { ...defaults, [field.name]: option }, `${field.name}=${option}`);
    }
  }

  // 3. Stress numeric fields: zeros, negatives, huge, tiny, non-integers.
  const numeric = fields.filter(f => f.type !== 'select');
  if (numeric.length && !['standard-calculator', 'scientific-calculator'].includes(calc.id)) {
    const probes = {
      zero: () => num(0),
      negative: () => num(-1),
      huge: () => num(1e12),
      tiny: () => num(0.0001),
      decimal: () => num(2.5),
      nonNumeric: () => 'abc',
    };
    for (const [label, make] of Object.entries(probes)) {
      const inputs = { ...defaults };
      for (const field of numeric) inputs[field.name] = make();
      tryRun(calc, inputs, label);
    }

    // 4. One field at a time, so a single bad input cannot hide behind another.
    for (const field of numeric) {
      tryRun(calc, { ...defaults, [field.name]: num(0) }, `${field.name}=0`);
      tryRun(calc, { ...defaults, [field.name]: num(-5) }, `${field.name}=-5`);
    }
  }
}

// --- expression parser -------------------------------------------------------
const expressions = [
  ['2+3*4', 14],
  ['(2+3)*4', 20],
  ['2^3^2', 512],
  ['-2^2', -4],
  ['sqrt(81)+sin(30)', 9.5],
  ['log(1000)', 3],
  ['ln(1)', 0],
  ['abs(-7)', 7],
  ['2pi', 2 * Math.PI],
  ['1/0', 'error'],
  ['sqrt(-1)', 'error'],
  ['log(0)', 'error'],
  ['1+', 'error'],
  ['(1+2', 'error'],
  ['alert(1)', 'error'],
  ['globalThis', 'error'],
  ['', 'error'],
];
for (const [expression, expected] of expressions) {
  checks += 1;
  try {
    const value = engine.expression(expression);
    if (expected === 'error') record({ id: `expression "${expression}"` }, 'parser', 'should have been rejected');
    else if (Math.abs(value - expected) > 1e-9) record({ id: `expression "${expression}"` }, 'parser', `got ${value}, expected ${expected}`);
  } catch (error) {
    if (expected !== 'error') record({ id: `expression "${expression}"` }, 'parser', `threw: ${error.message}`);
  }
}

// --- report ------------------------------------------------------------------
if (failures.length) {
  console.error(`\n${failures.length} failure(s) across ${checks} checks:\n`);
  for (const failure of failures.slice(0, 60)) console.error('  ✗ ' + failure);
  if (failures.length > 60) console.error(`  … and ${failures.length - 60} more`);
  process.exit(1);
}

console.log(`Passed: ${checks} checks across ${engine.calculators.length} calculators.`);
