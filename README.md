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
