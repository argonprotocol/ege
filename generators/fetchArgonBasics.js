import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const source = 'https://argon.network/data/argonBasics.mainnet.json';
const destination = new URL('../src/data/argonBasics.json', import.meta.url);
const temporary = new URL('../src/data/argonBasics.json.tmp', import.meta.url);

try {
  const response = await fetch(source, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const snapshot = await response.json();
  const { miningTDR, lastUpdatedAt, usdForArgon, usdForArgonot, mining } = snapshot;
  const apy = ((1 + miningTDR / 100) ** (365 / 10) - 1) * 100;
  if (typeof miningTDR !== 'number' || !Number.isFinite(miningTDR) || miningTDR < -100
    || !Number.isFinite(apy) || typeof lastUpdatedAt !== 'string'
    || !Number.isFinite(Date.parse(lastUpdatedAt))) {
    throw new Error('Invalid mainnet mining snapshot');
  }
  const rewards = [mining?.baseMicrogonRewardsPerBlock, mining?.baseMicronotRewardsPerBlock];
  if (![usdForArgon, usdForArgonot].every(price => typeof price === 'number' && Number.isFinite(price) && price > 0)
    || !rewards.every(amount => typeof amount === 'string' && /^\d+n$/.test(amount)
      && Number.isSafeInteger(Number(amount.slice(0, -1))))
    || rewards.every(amount => Number(amount.slice(0, -1)) === 0)
    || miningTDR < 0) {
    throw new Error('Invalid mainnet mining bid inputs');
  }
  const circulation = [snapshot.microgonsInCirculation?.total, snapshot.micronotsInCirculation,
    snapshot.microgonsInCirculation?.fromMining, snapshot.microgonsInCirculation?.fromBitcoin];
  if (!circulation.every(amount => typeof amount === 'string' && /^\d+n$/.test(amount)
    && Number.isFinite(Number(amount.slice(0, -1))))) {
    throw new Error('Invalid mainnet circulation inputs');
  }
  if (typeof snapshot.usdForBtc !== 'number' || !Number.isFinite(snapshot.usdForBtc) || snapshot.usdForBtc <= 0
    || ![snapshot.vaulting?.valueInVaults, snapshot.vaulting?.bitcoinLocked, snapshot.vaulting?.eligibleBondCapital]
      .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
    throw new Error('Invalid mainnet vaulting inputs');
  }
  if (!Number.isSafeInteger(mining.nextEpochSeatCount) || mining.nextEpochSeatCount < 10
    || typeof snapshot.activeArgonotStakes !== 'number' || !Number.isFinite(snapshot.activeArgonotStakes)
    || snapshot.activeArgonotStakes < 0) {
    throw new Error('Invalid mainnet growth engine inputs');
  }

  mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
  writeFileSync(temporary, JSON.stringify(snapshot, null, 2) + '\n');
  renameSync(temporary, destination);
  console.log(`Mining APY: ${apy.toFixed(2)}% (mainnet snapshot ${lastUpdatedAt})`);
} catch (error) {
  rmSync(temporary, { force: true });
  console.error('Unable to update mainnet mining snapshot:', error.message);
  process.exitCode = 1;
}
