---
name: "kar-tally"
description: "Audits an AI agent's spend ledger by recomputing every running balance from the budget cap down, to the cent, and reports each balance that does not add up, each gap in the sequence and each point where the cap was exceeded, even when a later balance was edited to hide it. Use when the user asks whether an agent stayed within budget, to check a spend, cost, credit or token-budget log, or to verify claimed balances before trusting an agent's own report. Deterministic Node.js script with no LLM judge and no network."
summary: "Did the agent stay under budget? Recompute a spend ledger from the cap: every cost, every claimed balance, every sequence number. PASS or FAIL with each violation named, plus a SHA-256 fingerprint of the input. No LLM judge, no network, mutation-tested."
version: "1.0.0"
tags: ["budget", "spend-control", "ledger", "audit", "agent-governance", "deterministic"]
use_cases: ["Check an agent's spend log before approving its next budget", "Catch a hidden overspend whose claimed balance was rewritten afterwards", "Prove to a finance reviewer that a ledger adds up, with a fingerprint they can recompute"]
docs_url: "https://sjgant80-hub.github.io/kar-tally/"
---

# Kar-Tally: did the agent stay under budget?

An agent's report of its own spending is a claim. Kar-Tally turns it into arithmetic: starting from the
cap, it subtracts each entry's cost in order, in whole cents, and checks every number the ledger claims.

For each entry it checks that:

- `seq` is the previous `seq` + 1 (the first equals `startSeq`, default 1), so a deleted or inserted entry shows;
- the claimed `balance` equals the recomputed balance to the cent, so an edited balance shows;
- the recomputed balance never goes below zero, so an overspend shows where it happened, even if a later
  balance was rewritten to look fine;
- the fields are there and well-formed: integer `seq`, non-empty `actor` and `action`, a finite `cost` of zero
  or more, a finite `balance`.

The verdict is `PASS` only when every entry passes every check. Otherwise it is `FAIL`, with each violation
named by row and sequence number.

## When to use it

- The user asks whether an agent, a run or a workflow stayed within its budget.
- You are given a spend, cost, credit or token-budget log and asked to check it.
- Before you repeat an agent's own claim about what it spent.

## How to run it

The script is `scripts/kar-tally.mjs`: one file, Node.js 20 or newer, no dependencies, no network, and it
writes no files. Run it unchanged and keep the `.mjs` extension.

1. Put the ledger in this shape (costs and balances in the budget's currency units, two decimal places):

   ```json
   {
     "cap": 500,
     "startSeq": 1,
     "entries": [
       { "seq": 1, "actor": "agent-1", "action": "api_call:search",   "cost": 40.00, "balance": 460.00 },
       { "seq": 2, "actor": "agent-1", "action": "api_call:generate", "cost": 75.50, "balance": 384.50 }
     ]
   }
   ```

   If the log is in another shape (CSV, a different field name), map it to this one first and say so.
2. Run `node scripts/kar-tally.mjs ledger.json`, or pipe the JSON in with `node scripts/kar-tally.mjs -`.
3. Read the exit code: `0` PASS, `1` FAIL, `2` the input could not be used (for example a cap that is not a
   number; the reason is on stderr).
4. Report the verdict, the total spent and the final recomputed balance. For FAIL, list each violation with
   its row and `seq`, and name the first row where the cap was exceeded, if any. Never call a FAIL ledger
   "within budget". Give the input `fingerprint` so the result can be re-checked.

## What it prints

`examples/hidden-overspend.json` is a six-entry ledger with a cap of 500 where entry 4 cost 400.00 and its
claimed balance was rewritten to 20.00. The report (`examples/hidden-overspend.out.json`, exit code 1) begins:

```json
{
  "tool": "kar-tally",
  "algorithm": "kar-tally-v1",
  "verdict": "FAIL",
  "cap": 500,
  "startSeq": 1,
  "totalSpent": 572.75,
  "finalBalance": -72.75,
  "violations": [
    { "index": 3, "seq": 4, "message": "cap exceeded: recomputed balance -27.75 is below zero" },
    { "index": 3, "seq": 4, "message": "balance mismatch: claimed 20.00, recomputed -27.75" }
  ]
}
```

The full report also has a `rows` table (claimed against recomputed balance for every entry), the input
`fingerprint` and the `method` in plain words. `examples/clean.json` is the same ledger untouched: PASS, exit 0.
`examples/deleted-entry.json` has entry 3 removed: FAIL, starting with
`sequence break: expected seq 3, found 4`.

## Re-check this skill yourself

Everything here is deterministic: the same ledger gives the same verdict, the same violations and the same
fingerprint on any machine, and no language model judges anything.

- **The arithmetic:** every recomputed balance is the cap minus the running sum of costs, in whole cents.
  Re-add the costs by hand or in a spreadsheet and compare the `rows`.
- **The fingerprint:** SHA-256 of the canonical JSON of `{cap, entries, startSeq}` (keys sorted at every
  depth, no whitespace). Any SHA-256 tool reproduces it.
- **The self-checks:** `node scripts/kar-tally.mjs --selftest` runs the live page's six tamper scenarios (a
  clean ledger, a hidden overspend, a deleted entry, an edited balance, a missing field, an empty ledger) and
  exits 0 only if every one is judged correctly.
- **The examples:** `node scripts/kar-tally.mjs examples/hidden-overspend.json` prints exactly the report in
  `examples/hidden-overspend.out.json`.
- **The page:** https://sjgant80-hub.github.io/kar-tally/ runs the same logic in a browser; its "Hidden
  overspend" sample, then "Verify ledger", shows the same violations and fingerprint.
- **The source:** https://github.com/sjgant80-hub/kar-tally (MIT). The script's KERNEL block is
  byte-identical to the logic of the live page and to `kernel.mjs`; CI fails if they ever differ.
- **CI on every push:** https://github.com/sjgant80-hub/kar-tally/actions/workflows/ci.yml runs the tests,
  the byte-identity check, the receipt check, the witness mutation gate and the ZIP build, and prints the
  ZIP's SHA-256.
- **The mutation gate:** witness v0.6 (https://github.com/sjgant80-hub/witness, tag `v0.6`) made
  38 single-operator changes (mutants) to the kernel and the tests caught 38 of them. None was baselined. The receipt is
  `receipts/witness.json` in the repository, for kernel SHA-256 `553245e6363cb6762d8ca5f1df3e213742634054978f7cf3a247c057c2d41b45`. With the repository and
  witness v0.6 side by side, `node gate.mjs --witness ../witness/witness.mjs` re-runs it.

## Where it stops

- It checks that the ledger is consistent with itself and with the cap. It does not check the costs against
  an outside bill or event log; anchor the source log separately for that.
- Amounts are compared in whole cents (two decimal places). A ledger kept in finer units must be scaled first.
- Entries are checked in the order given; it does not sort by time or by `seq`.

---

Made by AI Native Solutions, built by Kar. Powered by the Konomi architecture, created by Thomas Frumkin.
MIT licence: see `LICENSE`.
