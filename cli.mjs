// cli.mjs — Kar-Tally on the command line. build.mjs bundles this with the KERNEL block of index.html into
// scripts/kar-tally.mjs, the single file the Agensi skill runs. It recomputes an agent's spend ledger from the
// cap down, to the cent, and reports every balance that does not add up, every gap in the sequence and every
// point where the cap was exceeded. Exit 0 = PASS · 1 = FAIL (or a self-check failed) · 2 = unusable input.
import { readFileSync } from 'node:fs';
import { ALGO_VERSION, verifyLedger, fingerprint, runSelfTests } from './kernel.mjs';

const USAGE = `usage: node kar-tally.mjs <ledger.json | ->
       node kar-tally.mjs --selftest        run the page's built-in tamper scenarios
input:  {"cap": 500, "startSeq": 1, "entries": [{"seq": 1, "actor": "agent-1", "action": "api_call:search",
         "cost": 40.00, "balance": 460.00}, …]}      (startSeq is optional, default 1)
output: a JSON report on stdout. exit 0 = PASS, 1 = FAIL, 2 = bad input`;

class InputError extends Error {}
const fail = (msg) => { throw new InputError(msg); };

function readText(path) {
  try { return readFileSync(path === '-' ? 0 : path, 'utf8'); }
  catch (e) { return fail(`cannot read ${path === '-' ? 'stdin' : path}: ${e.code || e.message}`); }
}

async function tally(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('the input must be an object: {"cap", "startSeq", "entries"}');
  const { cap, entries } = input;
  const startSeq = input.startSeq === undefined ? 1 : input.startSeq;
  if (typeof cap !== 'number' || !isFinite(cap)) fail('"cap" must be a number');
  if (!Number.isInteger(startSeq)) fail('"startSeq" must be an integer');
  const result = verifyLedger(cap, startSeq, entries);
  return {
    exitCode: result.verdict === 'PASS' ? 0 : 1,
    report: {
      tool: 'kar-tally',
      algorithm: ALGO_VERSION,
      verdict: result.verdict,
      cap,
      startSeq,
      totalSpent: result.totalSpent,
      finalBalance: result.finalBalance,
      violations: result.violations,
      rows: result.rows,
      fingerprint: await fingerprint(cap, startSeq, entries),
      method: 'The running balance starts at the cap; each entry\'s cost is subtracted in array order, exactly to a millionth of a unit (sub-cent costs accumulate). ' +
        'Each seq must equal the previous seq + 1 (the first must equal startSeq), each claimed balance must equal the ' +
        'recomputed balance to the cent, and the recomputed balance must never go below zero. fingerprint = SHA-256 of ' +
        'the canonical JSON of {cap, startSeq, entries} (keys sorted, no whitespace).',
    },
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--selftest') {
    const results = runSelfTests();
    const passed = results.filter((t) => t.ok).length;
    process.stdout.write(JSON.stringify({ tool: 'kar-tally', algorithm: ALGO_VERSION, selftest: results, passed, total: results.length }, null, 2) + '\n');
    return passed === results.length ? 0 : 1;
  }
  if (args.length !== 1 || args[0] === '-h' || args[0] === '--help') { process.stderr.write(USAGE + '\n'); return 2; }
  let input;
  try { input = JSON.parse(readText(args[0])); } catch (e) { if (e instanceof InputError) throw e; fail(`the input is not valid JSON (${e.message})`); }
  const { exitCode, report } = await tally(input);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return exitCode;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`kar-tally: ${e instanceof InputError ? e.message : 'internal error: ' + (e && e.message)}\n`);
  process.exitCode = e instanceof InputError ? 2 : 3;
}
