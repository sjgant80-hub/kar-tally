// Kar-Tally as a cell of the estate genome: its judge (the kernel's own recompute), its lane and its health.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, inLane, health } from './genome/cell.mjs';
import { selfTestScenarios } from './kernel.mjs';

const ex = (f) => JSON.parse(readFileSync(new URL('./examples/' + f, import.meta.url), 'utf8'));
const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
const CLEAN = ex('clean.json');

test('judge: the clean ledger is verified; a hidden overspend and a deleted entry are not', async () => {
  assert.equal(await judge(CLEAN), 'verified');
  assert.equal(await judge(ex('hidden-overspend.json')), 'unverified');
  assert.equal(await judge(ex('deleted-entry.json')), 'unverified');
});

test('judge agrees with the kernel on every self-test scenario; the empty ledger is not a spend log to judge', async () => {
  const want = { PASS: 'verified', FAIL: 'unverified' };
  for (const s of selfTestScenarios) {
    const got = await judge({ cap: s.cap, startSeq: s.startSeq, entries: s.entries });
    assert.equal(got, s.entries.length ? want[s.expect] : 'refused', s.name);
  }
});

test('judge: the seed cases are the shipped examples, and they split good from bad', async () => {
  assert.deepEqual(seed.judge.cases.good, CLEAN);
  assert.deepEqual(seed.judge.cases.bad, ex('hidden-overspend.json'));
  assert.equal(await judge(seed.judge.cases.good), 'verified');
  assert.equal(await judge(seed.judge.cases.bad), 'unverified');
});

test('lane: a spend log is in lane, even one that fails; one entry is enough', async () => {
  assert.equal(await inLane(CLEAN), true);
  assert.equal(await inLane(ex('deleted-entry.json')), true);
  assert.equal(await inLane({ cap: 10, startSeq: 0, entries: [{}] }), true);
  assert.equal(await inLane(seed.boundary.inLane), true);
});

test('lane: anything that is not the kernel\'s input shape is out of lane, and the judge refuses it', async () => {
  const fn = Object.assign(() => {}, { cap: 500, startSeq: 1, entries: [{}] });
  const bad = [null, undefined, 'x', 5, true, fn, {}, seed.boundary.outOfLane,
    { ...CLEAN, cap: NaN }, { ...CLEAN, cap: Infinity }, { ...CLEAN, cap: '500' },
    { ...CLEAN, startSeq: 1.5 }, { ...CLEAN, startSeq: '1' },
    { ...CLEAN, entries: { length: 1, 0: {} } }, { ...CLEAN, entries: 'abc' }, { ...CLEAN, entries: [] }];
  for (const b of bad) {
    assert.equal(await inLane(b), false, String(JSON.stringify(b)));
    assert.equal(await judge(b), 'refused', String(JSON.stringify(b)));
  }
});

test('health says what Kar-Tally cannot measure from inside its repository', async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
});
