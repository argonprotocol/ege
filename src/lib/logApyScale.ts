/** Positions run from zero at the minimum APY to one at the maximum. */
export function createLogApyScale(minimum: number, maximum: number, trackHeight = 550) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum <= minimum) {
    throw new RangeError('A logarithmic APY scale requires 0 < minimum < maximum.');
  }
  const lower = Math.log(minimum);
  const span = Math.log(maximum) - lower;
  function toPosition(apy: number): number {
    if (apy <= minimum) return 0;
    if (apy >= maximum) return 1;
    return (Math.log(apy) - lower) / span;
  }
  function toApy(position: number): number {
    // Return exact endpoints so reaching the floor unlocks the next phase.
    if (position <= 0) return minimum;
    if (position >= 1) return maximum;
    return Math.exp(lower + position * span);
  }
  // Fill the track with readable labels, gently tightening toward the bottom.
  const height = Number.isFinite(trackHeight) ? Math.max(0, trackHeight) : 550;
  const count = Math.max(2, Math.floor(height / 55) + 1);
  const ticks = Array.from({ length: count }, (_, index) =>
    toApy(1 - (1 - index / (count - 1)) ** 0.8));
  return { toPosition, toApy, ticks };
}
