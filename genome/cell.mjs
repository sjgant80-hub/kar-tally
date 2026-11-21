// cell.mjs — Kar-Tally's three answers for the birth check (seed.json, genome/).
//
// judge  Kar-Tally's own recompute (verifyLedger in kernel.mjs, the same kernel the live page runs): a spend log is
//        verified when every claimed balance equals the cap minus the costs so far, the sequence has no gap and the
//        cap is never exceeded; unverified when the recompute finds any violation; refused when it is not a spend log.
// lane   the kernel's own input shape, the three checks it makes before it reads a single entry: a finite cap, an
//        integer starting sequence number and a non-empty list of entries. Anything else is not Kar-Tally's to judge.
import { verifyLedger } from '../kernel.mjs';

export async function inLane(input) {
  return input !== null && typeof input === 'object' && Number.isFinite(input.cap) && Number.isInteger(input.startSeq)
    && Array.isArray(input.entries) && input.entries.length > 0;
}

export async function judge(input) {
  if (!(await inLane(input))) return 'refused';
  return verifyLedger(input.cap, input.startSeq, input.entries).verdict === 'PASS' ? 'verified' : 'unverified';
}

// health: Kar-Tally runs in a visitor's browser and in other people's agents, and sends nothing back, so its use,
// who depends on it and when it last earned its keep cannot be seen from inside the repository: null, said honestly
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
