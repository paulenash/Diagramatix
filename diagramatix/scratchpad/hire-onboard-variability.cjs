/**
 * How variable should the compliance check be?
 *
 * The queue at the constraint is what the example is FOR, and queue length is
 * driven as much by variability as by load. A tight triangular damps it almost
 * to nothing; a realistic spread (some checks clear in an hour, some need
 * chasing for a week) makes the same 92% utilisation bite properly.
 */
const triMean = (a, m, b) => (a + m + b) / 3;
const triVar = (a, m, b) => (a * a + m * m + b * b - a * m - a * b - m * b) / 18;
const r = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const OPEN = 1850;

function erlangC(c, a) {
  let s = 0, term = 1;
  for (let k = 0; k < c; k++) { if (k > 0) term *= a / k; s += term; }
  const tail = term * (a / c) / (1 - a / c);
  return tail / (s + tail);
}
/** Allen-Cunneen: M/G/c queue wait from the M/M/c one. */
function queueWait(dist, holders, lambdaHours) {
  const mean = triMean(...dist), cs2 = triVar(...dist) / (mean * mean);
  const rate = 1 / lambdaHours, a = mean * rate;
  if (a >= holders) return null;
  return (erlangC(holders, a) / (holders / mean - rate)) * (1 + cs2) / 2;
}

const OPTIONS = [
  { label: "tight    tri(2.5, 3.5, 5)", dist: [2.5, 3.5, 5] },
  { label: "moderate tri(1.5, 3, 7)  ", dist: [1.5, 3, 7] },
  { label: "realistic tri(1, 3, 9)   ", dist: [1, 3, 9] },
];

for (const o of OPTIONS) {
  const mean = triMean(...o.dist);
  const cv = Math.sqrt(triVar(...o.dist)) / mean;
  // Pick the arrival rate that puts TWO holders at ~92%.
  const lambda = mean / (2 * 0.92);
  const wq2 = queueWait(o.dist, 2, lambda);
  const wq3 = queueWait(o.dist, 3, lambda);
  const otherHrOps = 0.8333 * 1.1628;   // Prepare offer
  const teamUtil = ((mean + otherHrOps) / lambda) / 4;
  console.log(o.label);
  console.log(`   mean ${r(mean)} h, CV ${r(cv, 2)}  ->  1 hire / ${r(lambda)} open-h = ${Math.round(OPEN / lambda)}/yr`);
  console.log(`   HR Operations TEAM utilisation ${(teamUtil * 100).toFixed(0)}%   (the number that hides the problem)`);
  console.log(`   2 trained: queue ${r(wq2, 1)} open-h = ${r(wq2 / 7.5, 2)} working days`);
  console.log(`   3 trained: queue ${r(wq3, 2)} open-h = ${r(wq3 / 7.5, 2)} working days`);
  console.log(`   >>> training one person saves ~${r((wq2 - wq3) / 7.5, 2)} working days per hire\n`);
}
