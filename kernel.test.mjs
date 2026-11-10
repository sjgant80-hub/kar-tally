// kernel.test.mjs — Kar-Tally's kernel (the KERNEL block of index.html, generated into kernel.mjs).
// Expected values are worked out by hand from the ledger arithmetic; witness v0.6 checks every test bites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALGO_VERSION, verifyLedger, canonicalize, sha256Hex, fingerprint, goodEntries, makeOverspend, makeGap, makeMismatch,
  selfTestScenarios, runSelfTests,
} from './kernel.mjs';

const entry = (seq, cost, balance, extra = {}) => ({ seq, actor: 'agent-1', action: 'api_call', cost, balance, ...extra });
const messages = (r) => r.violations.map((v) => `${v.index}:${v.message}`);

test('the algorithm name', () => assert.equal(ALGO_VERSION, 'kar-tally-v2'));

test('a clean ledger passes: every balance recomputes to the cent', () => {
  const r = verifyLedger(500, 1, goodEntries);
  assert.equal(r.verdict, 'PASS');
  assert.deepEqual(r.violations, []);
  assert.equal(r.totalSpent, 260.75);          // 40 + 75.50 + 12.25 + 88 + 5 + 40
  assert.equal(r.finalBalance, 239.25);
  assert.deepEqual(r.rows.map((x) => [x.recomputedBalance, x.ok]), [
    [460, true], [384.5, true], [372.25, true], [284.25, true], [279.25, true], [239.25, true],
  ]);
  assert.deepEqual(r.rows[0], {
    index: 0, seq: 1, actor: 'agent-1', action: 'api_call:search', cost: 40, claimedBalance: 460, recomputedBalance: 460,
    ok: true, flags: { capExceeded: false, balanceMismatch: false, seqBreak: false }, messages: [],
  });
});

test('a hidden overspend is caught where it happens, even when the claimed balance was rewritten', () => {
  const r = verifyLedger(500, 1, makeOverspend());
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(messages(r).slice(0, 2), [
    '3:cap exceeded: recomputed balance -27.75 is below zero',
    '3:balance mismatch: claimed 20.00, recomputed -27.75',
  ]);
  assert.equal(r.rows[3].flags.capExceeded, true);
  assert.equal(r.rows[3].flags.balanceMismatch, true);
  assert.equal(r.rows[2].ok, true);
  assert.equal(r.totalSpent, 572.75);
});

test('a deleted entry is a sequence break; an edited balance is a mismatch', () => {
  const gap = verifyLedger(500, 1, makeGap());
  assert.ok(messages(gap).includes('2:sequence break: expected seq 3, found 4'));
  assert.equal(gap.rows[2].flags.seqBreak, true);
  const edited = verifyLedger(500, 1, makeMismatch());
  assert.deepEqual(messages(edited), ['4:balance mismatch: claimed 300.00, recomputed 279.25']);
  assert.deepEqual(edited.rows.map((x) => x.ok), [true, true, true, true, false, true]);
});

test('spending exactly to zero is within the cap; one cent more is not', () => {
  assert.equal(verifyLedger(100, 1, [entry(1, 100, 0)]).verdict, 'PASS');
  assert.deepEqual(messages(verifyLedger(100, 1, [entry(1, 100.01, -0.01)])), ['0:cap exceeded: recomputed balance -0.01 is below zero']);
});

test('the sequence starts at startSeq and steps by one', () => {
  assert.equal(verifyLedger(10, 7, [entry(7, 1, 9), entry(8, 1, 8)]).verdict, 'PASS');
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(7, 1, 9)])), ['0:sequence break: expected seq 1, found 7']);
});

test('a non-integer seq is reported once and the count carries on from the expected value', () => {
  const r = verifyLedger(10, 1, [entry(1, 1, 9), entry(1.5, 1, 8), entry(3, 1, 7)]);
  assert.deepEqual(messages(r), ['1:seq must be an integer']);
});

test('field rules: cost may be zero but not negative, infinite or a string; the rest must be present and typed', () => {
  assert.equal(verifyLedger(10, 1, [entry(1, 0, 10)]).verdict, 'PASS');
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, -5, 15)])), ['0:cost must be a non-negative finite number']);
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, Infinity, 10)])), ['0:cost must be a non-negative finite number']);
  const strCost = verifyLedger(10, 1, [entry(1, '5', 10)]);
  assert.deepEqual(messages(strCost), ['0:cost must be a non-negative finite number']);
  assert.equal(strCost.rows[0].recomputedBalance, null);
  assert.equal(strCost.totalSpent, 0);
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, 1, '9')])), ['0:balance must be a finite number']);
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, 1, Infinity)])), ['0:balance must be a finite number']);
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, 1, 9, { actor: '' })])), ['0:actor must be a non-empty string']);
  assert.deepEqual(messages(verifyLedger(10, 1, [entry(1, 1, 9, { action: '' })])), ['0:action must be a non-empty string']);
  assert.deepEqual(messages(verifyLedger(10, 1, [{ seq: 1, actor: 'a', cost: 1, balance: 9 }])), [
    '0:missing field "action"', '0:action must be a non-empty string',
  ]);
});

test('entries that are not a non-empty list fail with one violation, never a throw', () => {
  const none = { verdict: 'FAIL', violations: [{ index: -1, seq: null, message: 'entries must be a non-empty array' }], rows: [], totalSpent: 0, finalBalance: 500 };
  assert.deepEqual(verifyLedger(500, 1, []), none);
  assert.deepEqual(verifyLedger(500, 1, undefined), none);
  assert.deepEqual(verifyLedger(500, 1, { length: 2 }), none);
});

test('an entry that is not an object is a violation, never a throw', () => {
  const r = verifyLedger(10, 1, [null, 7, entry(3, 1, 9)]);
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(r.violations.filter((v) => v.index === 0).map((v) => v.message).slice(0, 2), ['entry must be an object', 'missing field "seq"']);
  assert.ok(messages(r).includes('1:entry must be an object'));
  assert.deepEqual(r.rows[2].messages, []);   // the count carried on: seq 3 was expected
});

test('canonicalize: keys sorted at every depth, arrays in order, primitives as JSON', () => {
  assert.equal(canonicalize({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  assert.equal(canonicalize(null), 'null');
  assert.equal(canonicalize(5), '5');
  assert.equal(canonicalize('s'), '"s"');
});

test('fingerprint: SHA-256 of the canonical {cap, entries, startSeq}', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const fp = await fingerprint(10, 1, [{ seq: 1, actor: 'a', action: 'x', cost: 1, balance: 9 }]);
  assert.equal(fp, await sha256Hex('{"cap":10,"entries":[{"action":"x","actor":"a","balance":9,"cost":1,"seq":1}],"startSeq":1}'));
});

test('self-test: the page\'s six scenarios are all judged correctly', () => {
  assert.equal(selfTestScenarios.length, 6);
  const results = runSelfTests();
  assert.deepEqual(results.map((r) => [r.name, r.verdict, r.ok]), [
    ['Clean ledger', 'PASS', true], ['Hidden overspend', 'FAIL', true], ['Deleted entry', 'FAIL', true],
    ['Edited balance only', 'FAIL', true], ['Missing field', 'FAIL', true], ['Empty ledger', 'FAIL', true],
  ]);
  assert.equal(results[0].caught, '');
  assert.equal(results[1].caught, 'cap exceeded: recomputed balance -27.75 is below zero');
});

test('runSelfTests: a scenario expecting the wrong verdict is reported as not ok', () => {
  const r = runSelfTests([{ name: 'n', desc: 'd', cap: 10, startSeq: 1, entries: [entry(1, 1, 9)], expect: 'FAIL' }]);
  assert.deepEqual(r, [{ name: 'n', desc: 'd', expect: 'FAIL', verdict: 'PASS', ok: false, caught: '' }]);
});

test('a cap that is not a finite number, or a start that is not an integer, fails with a reason, never a throw', () => {
  const badCap = (message) => ({ verdict: 'FAIL', violations: [{ index: -1, seq: null, message }], rows: [], totalSpent: 0, finalBalance: 0 });
  assert.deepEqual(verifyLedger('500', 1, goodEntries), badCap('cap must be a finite number'));
  assert.deepEqual(verifyLedger(NaN, 1, goodEntries), badCap('cap must be a finite number'));
  assert.deepEqual(verifyLedger(10n, 1, goodEntries), badCap('cap must be a finite number'));
  assert.deepEqual(verifyLedger(500, 1.5, goodEntries),
    { verdict: 'FAIL', violations: [{ index: -1, seq: null, message: 'startSeq must be an integer' }], rows: [], totalSpent: 0, finalBalance: 500 });
  assert.deepEqual(verifyLedger(500, 1n, goodEntries).violations[0].message, 'startSeq must be an integer');
});

// v2 regression: sub-cent costs must accumulate, not round to 0 or 1 cent per row (reported publicly, 4 Nov 2026).
const many = (n, cost, cap) => Array.from({ length: n }, (_, i) => entry(i + 1, cost, Math.round((cap - cost * (i + 1)) * 1e6) / 1e6));
test('500 x $0.004 totals $2.00, not $0', () => {
  const r = verifyLedger(10, 1, many(500, 0.004, 10));
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.totalSpent, 2);
  assert.equal(r.finalBalance, 8);
});
test('500 x $0.006 totals $3.00, not $5', () => {
  const r = verifyLedger(10, 1, many(500, 0.006, 10));
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.totalSpent, 3);
  assert.equal(r.finalBalance, 7);
});
test('a sub-cent overspend hidden by rounding is caught', () => {
  const r = verifyLedger(1, 1, many(300, 0.004, 1)); // 300 x 0.004 = 1.20 against a $1 cap
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => /cap exceeded/.test(v.message)));
  assert.equal(r.totalSpent, 1.2);
});
test('a claimed balance that ignores sub-cent costs is flagged', () => {
  const e = many(500, 0.004, 10).map((x) => ({ ...x, balance: 10 }));
  const r = verifyLedger(10, 1, e);
  assert.equal(r.verdict, 'FAIL');
  assert.ok(r.violations.some((v) => /balance mismatch/.test(v.message)));
});

// v2 limits (Kar's review of the sub-cent fix): counting to a millionth is exact only up to a safe integer.
test('a cap too large to count exactly to a millionth fails, and the largest safe cap still counts', () => {
  assert.deepEqual(verifyLedger(1e10, 1, goodEntries),
    { verdict: 'FAIL', violations: [{ index: -1, seq: null, message: 'cap is too large to count exactly to a millionth' }], rows: [], totalSpent: 0, finalBalance: 1e10 });
  assert.equal(verifyLedger(-1e10, 1, goodEntries).violations[0].message, 'cap is too large to count exactly to a millionth');
  const r = verifyLedger(9e9, 1, [entry(1, 1, 9e9 - 1)]);
  assert.equal(r.verdict, 'PASS');
  assert.equal(r.finalBalance, 9e9 - 1);
});
test('a running total pushed past exact counting is flagged on that row', () => {
  const r = verifyLedger(1, 1, [entry(1, 0.5, 0.5), entry(2, 1e10, 0.5 - 1e10)]);
  assert.equal(r.verdict, 'FAIL');
  assert.deepEqual(messages(r).filter((m) => /too large/.test(m)), ['1:running total is too large to count exactly to a millionth']);
  assert.equal(r.rows[0].ok, true);
});
test('claimed balances are compared to the cent, half a cent rounding up', () => {
  // 10 - 0.005 = 9.995 recomputed; to the cent that is 10.00 (Math.round rounds the half up), not 9.99
  assert.equal(verifyLedger(10, 1, [entry(1, 0.005, 10)]).verdict, 'PASS');
  assert.equal(verifyLedger(10, 1, [entry(1, 0.005, 9.99)]).verdict, 'FAIL');
  // 10 - 0.0049 = 9.9951 is still 10.00 to the cent; 10 - 0.0051 = 9.9949 is 9.99
  assert.equal(verifyLedger(10, 1, [entry(1, 0.0051, 9.99)]).verdict, 'PASS');
  assert.equal(verifyLedger(10, 1, [entry(1, 0.0051, 10)]).verdict, 'FAIL');
  assert.equal(verifyLedger(10, 1, [entry(1, 0.0051, 9.99)]).rows[0].recomputedBalance, 9.9949);
});
