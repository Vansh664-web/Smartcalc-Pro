const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../calculations.js`, 'utf8'), { window });
const engine = window.SmartCalc;
const calculator = id => engine.calculators.find(item => item.id === id);
const run = (id, values) => engine.calculate(calculator(id), values);
const defaults = calc => Object.fromEntries(engine.schema(calc).map(field => [field.name, field.default]));

assert.equal(engine.calculators.length, 79, 'the full calculator catalog is present');
for (const calc of engine.calculators) {
  if (['standard-calculator', 'scientific-calculator'].includes(calc.id)) continue;
  const result = engine.calculate(calc, defaults(calc));
  assert.ok(result && typeof result.value === 'string', `${calc.name} returns a displayable result`);
}

assert.equal(run('gst-calculator', {amount:'1000',rate:'18'}).value, '180 ₹');
assert.equal(run('gst-inclusive-calculator', {amount:'1180',rate:'18'}).value, '1,000 ₹');
assert.equal(run('percentage-calculator', {amount:'250',rate:'12'}).value, '30');
assert.equal(run('meter-to-feet', {value:'1'}).value, '3.28084 Feet');
assert.equal(run('temperature-converter', {value:'0',from:'Celsius',to:'Fahrenheit'}).value, '32 Fahrenheit');
assert.equal(run('emi-calculator', {principal:'100000',rate:'0',years:'1'}).value, '₹8,333.33');
assert.equal(run('quadratic-equation-solver', {a:'1',b:'-3',c:'2'}).value, '2 and 1');
assert.equal(run('matrix-calculator', {matrix:'1, 2; 3, 4',matrix2:'5, 6; 7, 8',operation:'Multiply'}).value, '19, 22 ; 43, 50');
assert.equal(run('determinant-calculator', {matrix:'1, 2; 3, 4'}).value, '-2');
assert.equal(run('tiles-calculator', {length:'0',width:'2',tileLength:'1',tileWidth:'1'}).value, '0 tiles');
assert.equal(engine.expression('2+3*4'), 14);
assert.equal(engine.expression('sqrt(81)+sin(30)'), 9.5);
assert.equal(engine.expression('2^3+pi'), 8 + Math.PI);
assert.throws(() => run('quadratic-equation-solver', {a:'0',b:'2',c:'1'}), /must not be zero/);
assert.throws(() => run('fraction-calculator', {a:'1',b:'0',c:'1',d:'2'}), /greater than zero/);
assert.equal(run('ratio-calculator', {a:'12',b:'18'}).value, '2:3');
assert.equal(run('ratio-calculator', {a:'0',b:'5'}).value, '0:1');
assert.throws(() => run('ratio-calculator', {a:'0',b:'0'}), /non-zero term/);
assert.throws(() => engine.expression('1/0'), /Division by zero/);
assert.throws(() => engine.expression('globalThis.alert(1)'), /requires parentheses|Unknown function/);

console.log(`Passed: ${engine.calculators.length} catalog entries and calculation edge cases.`);
