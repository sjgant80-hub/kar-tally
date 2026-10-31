# Kar-Tally

**Live:** https://sjgant80-hub.github.io/kar-tally/

Deterministic budget-cap ledger auditor — **no LLM judge**. Paste an AI agent's spend log (a cap plus
per-entry costs and claimed running balances); Kar-Tally recomputes the whole ledger from scratch —
cap minus cumulative cost per entry — to prove the claimed balances are arithmetically consistent, the
sequence has no gaps, and the cap was never exceeded, even if a later balance was edited to hide an
overspend. "Did this agent stay under budget" becomes a byte-for-byte recomputable verdict, not a
trusted self-report.

One self-contained HTML file — no backend, no network, nothing sent anywhere, runs in your browser.

**Honest limit:** it only checks the internal consistency of the numbers you feed it — not whether those
numbers match a real external billing or event source. Anchor/attest the source log separately for that.

Built by **Kar** (karma-didy) on the FallForge estate.

## Use it from an agent

`SKILL.md` makes this repository an agent skill in the open SKILL.md format (Claude Code, Codex CLI, Cursor and
others read it). The agent runs `scripts/kar-tally.mjs`, one Node.js 20+ file with no dependencies and no network,
and gets the same verdicts and the same receipt hash as this page:

    node scripts/kar-tally.mjs examples/hidden-overspend.json

`node make-zip.mjs` checks the package against Agensi's published rules and builds `dist/kar-tally.zip`, the
upload for the Agensi skill marketplace. CI builds the same ZIP on every push and prints its SHA-256.

## Proof

- **One source of truth:** the KERNEL block of `index.html` is the verifier. `node build.mjs` copies it
  byte-for-byte into `kernel.mjs` and into the skill script; CI fails if the three ever differ.
- **Tests:** `npm test` runs the kernel tests, and runs the skill script alone in an empty folder, the way
  Agensi runs it, against the expected outputs in `examples/`.
- **Mutation gate:** witness v0.6 made 38 single-operator mutants of `kernel.mjs` and the tests caught
  38; no survivors and nothing baselined. Receipt: `receipts/witness.json` (kernel SHA-256 `553245e6363cb676…`).
  CI re-runs the gate on every push: https://github.com/sjgant80-hub/kar-tally/actions/workflows/ci.yml

Powered by the Konomi architecture, created by Thomas Frumkin. MIT licence (see `LICENSE`).
