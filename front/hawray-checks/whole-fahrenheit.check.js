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
// A feature with a whole degree Celsius step cannot reach every whole F (1 C is 1.8 F): the value picked lands on a
// whole C within one F of what was asked, and a press never stalls or moves by more than 2 F
report['celsius step 1'].forEach(failure => {
  const [asked, sent, shown] = failure.split('->').map(Number);
  assert.ok(Number.isInteger(sent), `${failure}: not a whole C`);
  assert.ok(Math.abs(shown - asked) <= 1, `${failure}: more than 1 F away`);
});
{
  let stepValue = t.toFeatureSetpoint(60, setpointOf(C, 1, 5, 35));
  for (let i = 0; i < 10; i += 1) {
    const before = t.toDisplayValue(stepValue, C, F);
    stepValue = t.stepSetpoint(stepValue, 1, setpointOf(C, 1, 5, 35), 1);
    const moved = t.toDisplayValue(stepValue, C, F) - before;
    assert.ok(moved >= 1 && moved <= 2, `1 C step press moved ${moved} F`);
  }
}

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

// Group control, F user, all members Celsius-native with no step (the case the 0.5 C grid exists for): + moves exactly
// 1 F per press, every press reaches the next whole F, and the members receive the 0.5 C grid value (74 F = 23.5 C)
const groupOut = path.join(os.tmpdir(), 'groupControl.check.cjs');
buildSync({
  entryPoints: [path.join(__dirname, '../src/components/boxs/hawray-group-control/groupControl.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: groupOut,
  logLevel: 'error'
});
// eslint-disable-next-line import/no-dynamic-require
const g = require(groupOut);
const member = (selector, value) => ({
  selector,
  category: 'thermostat',
  type: 'target-temperature',
  unit: C,
  min: 7,
  max: 35,
  last_value: value,
  device: { id: selector, name: selector }
});
const runGroup = (userUnit, presses, direction, start) => {
  let members = [member('a', start), member('b', start)];
  const shown = [];
  const sentToMembers = [];
  for (let i = 0; i <= presses; i += 1) {
    const [groupFeature] = g.buildGroupFeatures(members, userUnit);
    shown.push(t.toDisplayValue(groupFeature.last_value, C, userUnit));
    if (i === presses) break;
    const setpoint = {
      featureUnit: C,
      displayUnit: userUnit,
      featureStep: groupFeature.step,
      min: groupFeature.min,
      max: groupFeature.max
    };
    const sent = t.stepSetpoint(groupFeature.last_value, direction, setpoint, userUnit === F ? 1 : 0.5);
    const writes = g.planGroupWrites(members, groupFeature, sent, userUnit);
    sentToMembers.push(writes.map(w => w.value));
    members = g.applyWritesToMembers(members, writes, new Date().toISOString());
  }
  return { shown, sentToMembers };
};
{
  const up = runGroup(F, 4, 1, 22.2);
  assert.deepStrictEqual(up.shown, [72, 73, 74, 75, 76]);
  assert.deepStrictEqual(up.sentToMembers[1], [23.5, 23.5]);
  const down = runGroup(F, 4, -1, 22.2);
  assert.deepStrictEqual(down.shown, [72, 71, 70, 69, 68]);
  // Every whole F from 60 to 90 can be set on the group and is read back as the same whole F
  for (let f = 60; f <= 90; f += 1) {
    const [groupFeature] = g.buildGroupFeatures([member('a', 22), member('b', 22)], F);
    const setpoint = {
      featureUnit: C,
      displayUnit: F,
      featureStep: groupFeature.step,
      min: groupFeature.min,
      max: groupFeature.max
    };
    const sent = t.toFeatureSetpoint(f, setpoint);
    const members = [member('a', 22), member('b', 22)];
    const [readBack] = g.buildGroupFeatures(
      g.applyWritesToMembers(members, g.planGroupWrites(members, groupFeature, sent, F), 'now'),
      F
    );
    assert.strictEqual(t.toDisplayValue(readBack.last_value, C, F), f, `group ${f} F -> ${readBack.last_value} C`);
  }
  // A Celsius user is unchanged: the group has no step, a press moves a whole degree Celsius, and members get whole C
  const [celsiusGroup] = g.buildGroupFeatures([member('a', 22), member('b', 22)], C);
  assert.strictEqual(celsiusGroup.step, undefined);
  const celsiusRun = runGroup(C, 2, 1, 22);
  assert.deepStrictEqual(celsiusRun.shown, [22, 23, 24]);
  assert.deepStrictEqual(celsiusRun.sentToMembers[0], [23, 23]);
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

// Round 3: the one rule every display site reads (gauge, chart, activity, chips, controls table, raw value)
const fUser = { temperature_unit_preference: F };
const cUser = { temperature_unit_preference: C };
const loadingUser = { language: 'en' }; // the store user before /api/v1/me answers
assert.strictEqual(t.prefersFahrenheit(fUser), true);
assert.strictEqual(t.prefersFahrenheit(cUser), false);
assert.strictEqual(t.prefersFahrenheit(loadingUser), false);
assert.strictEqual(t.prefersFahrenheit(undefined), false);
assert.deepStrictEqual(t.getUserTemperatureDisplay(23, C, fUser), { value: 73, unit: F });
assert.deepStrictEqual(t.getUserTemperatureDisplay(22.2, C, fUser), { value: 72, unit: F });
assert.deepStrictEqual(t.getUserTemperatureDisplay(70.5, F, fUser), { value: 71, unit: F });
assert.deepStrictEqual(t.getUserTemperatureDisplay('21.4', C, fUser), { value: 71, unit: F });
// a Celsius user, a user not loaded yet, a non-temperature unit or no value: the caller keeps its own display
[
  [22.2, C, cUser],
  [70.5, F, cUser],
  [22.2, C, loadingUser],
  [22.2, C, undefined],
  [45, 'percent', fUser],
  [45, undefined, fUser],
  [null, C, fUser],
  [undefined, C, fUser],
  ['', C, fUser],
  ['abc', C, fUser]
].forEach(([value, unit, user]) => assert.strictEqual(t.getUserTemperatureDisplay(value, unit, user), null));
// ranges: inward, whole degrees (7..30 C is 44.6..86 F, shown 45..86)
assert.deepStrictEqual(t.getUserTemperatureRange(7, 30, C, fUser), { min: 45, max: 86, unit: F });
assert.deepStrictEqual(t.getUserTemperatureRange(44.6, 86.4, F, fUser), { min: 45, max: 86, unit: F });
assert.strictEqual(t.getUserTemperatureRange(7, 30, C, cUser), null);
assert.strictEqual(t.getUserTemperatureRange(0, 100, 'percent', fUser), null);
// chart text: a reading is whole, a tick keeps the gridline precision
assert.strictEqual(t.formatWholeFahrenheitReading(71.96), '72');
assert.strictEqual(t.formatWholeFahrenheitReading(undefined), undefined);
assert.strictEqual(t.formatFahrenheitAxisTick(72), '72');
assert.strictEqual(t.formatFahrenheitAxisTick(71.5), '71.5');
assert.strictEqual(t.formatFahrenheitAxisTick(71.999999), '72');
assert.strictEqual(t.formatFahrenheitAxisTick(null), null);
console.log('OK');
