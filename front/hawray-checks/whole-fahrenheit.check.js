// Node-run check of the whole degree Fahrenheit rules in src/utils/hawrayTemperature.js (not part of the build).
// Run from front/: node hawray-checks/whole-fahrenheit.check.js
const assert = require('assert');
const os = require('os');
const path = require('path');
const { buildSync } = require('esbuild');

const out = path.join(os.tmpdir(), 'hawrayTemperature.check.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '../src/utils/hawrayTemperature.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out
});
// eslint-disable-next-line import/no-dynamic-require
const t = require(out);

const C = 'celsius';
const F = 'fahrenheit';
const setpointOf = (featureUnit, featureStep, min, max) => ({ featureUnit, displayUnit: F, featureStep, min, max });

// Acceptance 2: every whole F in 60-90 round trips (pick -> native value -> displayed value)
const roundTrip = (featureUnit, featureStep) => {
  const failures = [];
  for (let f = 60; f <= 90; f += 1) {
    const sent = t.toFeatureSetpoint(f, setpointOf(featureUnit, featureStep));
    const shown = t.toDisplayValue(sent, featureUnit, F);
    if (shown !== f) failures.push(`${f}->${sent}->${shown}`);
  }
  return failures;
};
const report = {};
[
  [C, undefined],
  [C, 0.5],
  [C, 1],
  [F, undefined],
  [F, 1]
].forEach(([unit, step]) => {
  report[`${unit} step ${step}`] = roundTrip(unit, step);
});
console.log(JSON.stringify(report, null, 1));
assert.deepStrictEqual(report['celsius step undefined'], []);
assert.deepStrictEqual(report['celsius step 0.5'], []);
assert.deepStrictEqual(report['fahrenheit step undefined'], []);
assert.deepStrictEqual(report['fahrenheit step 1'], []);

// Stepping: 72 F -> 73 F on a celsius (0.5 step) and on a fahrenheit feature, in both directions
const c72 = t.toFeatureSetpoint(72, setpointOf(C, 0.5));
assert.strictEqual(t.toDisplayValue(t.stepSetpoint(c72, 1, setpointOf(C, 0.5), 1), C, F), 73);
assert.strictEqual(t.toDisplayValue(t.stepSetpoint(c72, -1, setpointOf(C, 0.5), 1), C, F), 71);
assert.strictEqual(t.stepSetpoint(72, 1, setpointOf(F), 1), 73);
// A fahrenheit value from a remote with a decimal still steps by a whole degree from what is shown
assert.strictEqual(t.stepSetpoint(72.4, 1, setpointOf(F), 1), 73);

// Every press on a 0.5 C feature moves exactly 1 F over the whole range
let value = t.toFeatureSetpoint(60, setpointOf(C, 0.5));
for (let f = 61; f <= 90; f += 1) {
  value = t.stepSetpoint(value, 1, setpointOf(C, 0.5), 1);
  assert.strictEqual(t.toDisplayValue(value, C, F), f);
}

// Rounding is conventional
assert.strictEqual(t.roundForUnit(72.5, F), 73);
assert.strictEqual(t.roundForUnit(72.49, F), 72);
assert.strictEqual(t.roundForUnit(21.26, C), 21.3);
assert.strictEqual(t.formatTemperature(71.6, F), '72');
assert.strictEqual(t.formatTemperature(21.26, C), '21.3');

// Bounds round inward: 16 C = 60.8 F -> 61, 30 C = 86 F -> 86, 30.2 C = 86.36 F -> 86, 15.5 C = 59.9 F -> 60
assert.strictEqual(t.toDisplayBound(16, C, F, false), 61);
assert.strictEqual(t.toDisplayBound(30, C, F, true), 86);
assert.strictEqual(t.toDisplayBound(30.2, C, F, true), 86);
assert.strictEqual(t.toDisplayBound(15.5, C, F, false), 60);
assert.strictEqual(t.toDisplayBound(60.5, F, F, false), 61);
assert.strictEqual(t.toDisplayBound(86.5, F, F, true), 86);
assert.strictEqual(t.toDisplayBound(10, C, C, false), 10);
assert.strictEqual(t.toDisplayBound(undefined, C, F, false), undefined);
// A whole-degree bound is not pushed inward by floating point noise: 21.1111 C is 70 F
assert.strictEqual(t.toDisplayBound(((70 - 32) * 5) / 9, C, F, false), 70);
assert.strictEqual(t.toDisplayBound(((70 - 32) * 5) / 9, C, F, true), 70);
// Every whole F inside the inward bounds writes a native value inside the device range
for (let f = t.toDisplayBound(16, C, F, false); f <= t.toDisplayBound(30, C, F, true); f += 1) {
  const sent = t.toFeatureSetpoint(f, setpointOf(C, 0.5, 16, 30));
  assert.ok(sent >= 16 && sent <= 30, `${f} -> ${sent}`);
}
// A press at the bound stays on it
assert.strictEqual(t.stepSetpoint(30, 1, setpointOf(C, 0.5, 16, 30), 1), 30);

// ThermostatBox, F user on a Celsius-native feature (16-30 C, no step): the same arithmetic as toWholeFahrenheitSetpoint.
// 22.2 C shows 72 F; + sends 23 C (73 F), + again sends 23.5 C (74 F). Converted once, in the front, as the server
// does not convert a value written on the setpoint feature.
{
  const box = { featureUnit: C, displayUnit: F, min: 16, max: 30 };
  const press = (native, delta) => t.toFeatureSetpoint(t.toDisplayValue(native, C, F) + delta, box);
  assert.strictEqual(t.toDisplayValue(22.2, C, F), 72);
  const first = press(22.2, 1);
  assert.strictEqual(first, 23);
  assert.strictEqual(t.toDisplayValue(first, C, F), 73);
  const second = press(first, 1);
  assert.strictEqual(second, 23.5);
  assert.strictEqual(t.toDisplayValue(second, C, F), 74);
  assert.strictEqual(press(second, -1), 23);
}

// Display step: whole degrees in F, untouched in C
assert.strictEqual(t.getDisplayStep(setpointOf(C, 0.5), 1), 1);
assert.strictEqual(t.getDisplayStep(setpointOf(C, 2), 1), 4);
assert.strictEqual(t.getDisplayStep({ featureUnit: F, displayUnit: C, featureStep: 1 }, 0.5), 1 / 1.8);
assert.strictEqual(t.getDisplayStep({ featureUnit: C, displayUnit: C, featureStep: 0.5 }, 0.5), 0.5);

// Item 7: a fahrenheit feature shown to a celsius user, steps of 0.5 C, which moves 1 F per press
const fSetpointForC = { featureUnit: F, displayUnit: C, featureStep: undefined };
let v = 72;
const seen = [];
for (let i = 0; i < 6; i += 1) {
  v = t.stepSetpoint(v, 1, fSetpointForC, 0.5);
  seen.push(`${v}F/${t.roundDisplayValue(t.convertTemperature(v, F, C))}C`);
}
console.log('F feature, C user, 6 presses from 72 F:', seen.join(' '));
console.log('OK');
