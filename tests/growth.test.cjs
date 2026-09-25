const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GrowthSimulation, VAULTING_MIN_APY, minimumApyFor, createVaultingCapitalScale } = require('../src/lib/GrowthSimulation');
const { mainnetBasics, miningApy, vaultingApy } = require('../src/lib/mainnet');
const { calculateVaultRevenueShare, isValidGrowthState, iterateGrowthCycle } = require('../src/lib/exponentialTriggers');

test('initial defaults match the copied engine', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  assert.equal(sim.view.frame.miningApy, miningApy);
  assert.equal(sim.view.frame.vaultingApy, vaultingApy);
  assert(isValidGrowthState(sim.view.frame.state));
});

test('lower mining APY adds bid revenue and raises vaulting APY', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const before = structuredClone(sim.view);
  const result = sim.preview('mining', 19000);
  assert(result.frame.miningApy < before.frame.miningApy);
  assert(result.frame.vaultingApy > before.frame.vaultingApy);
  assert(result.transfer.bids > 0);
  assert(Math.abs(result.transfer.revenue - result.transfer.bids * calculateVaultRevenueShare(result.frame.state)) < 1e-8);
  assert(result.transfer.revenue > 0 && result.transfer.revenue < result.transfer.bids);
  assert(isValidGrowthState(result.frame.state));
});

test('lower vaulting APY increases mining rewards and APY', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const before = structuredClone(sim.view);
  const result = sim.preview('vaulting', 3000);
  assert(result.frame.vaultingApy < before.frame.vaultingApy);
  assert(result.frame.miningApy > before.frame.miningApy);
  assert(result.transfer.capital > 0);
  assert(result.transfer.rewards > 0);
  assert.equal(result.transfer.rewards, (result.frame.state.pendingMiningMint - before.frame.state.pendingMiningMint) * before.frame.state.argonPriceUsd);
  assert(isValidGrowthState(result.frame.state));
});

test('vaulting returns added principal in payout and stops at a 53.99% annualized return', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const initial = structuredClone(sim.view);
  const startCapital = initial.frame.state.vaultArgonSecuritization * 3;
  let previousAdded = 0;
  for (const target of [3000, 1000, 100, VAULTING_MIN_APY, 0]) {
    const result = sim.preview('vaulting', target);
    const added = result.transfer.capital / result.frame.state.argonPriceUsd;
    const total = startCapital + added;
    assert.equal(result.vaultingPayout, initial.vaultingPayout + added);
    assert(Math.abs((result.vaultingPayout - total) - (initial.vaultingPayout - startCapital)) < 1e-8);
    assert.equal(result.transfer.revenue, 0);
    assert(added >= previousAdded);
    assert(total < result.vaultingPayout, 'capital must remain below total payout');
    const actualApy = ((result.vaultingPayout / total) ** (365 / 10) - 1) * 100;
    assert(Math.abs(actualApy - Math.max(target, 53.99)) < 1e-6);
    assert(Math.abs(result.frame.vaultingApy - actualApy) < 1e-6);
    assert.equal(result.frame.state.returns.vaultingApy, result.frame.vaultingApy);
    assert(Math.abs(result.transfer.capital - result.transfer.rewards * 3) < 1e-8);
    previousAdded = added;
  }
  assert(previousAdded > startCapital, 'diluting fixed earnings requires substantial added principal');
  assert.equal(sim.view.frame.vaultingApy, 53.99);
  assert.equal(sim.canBegin('mining'), true);
  assert.deepEqual(sim.preview('vaulting', initial.frame.vaultingApy), initial);
});

test('vault payout carries principal and revenue across phases without double counting', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  sim.preview('vaulting', 53.99);
  const vaultEnd = structuredClone(sim.view);
  const mining = sim.preview('mining', 53.3);
  assert.equal(mining.vaultingPayout,
    vaultEnd.vaultingPayout + mining.transfer.revenue / mining.frame.state.argonPriceUsd);
  const capital = mining.frame.state.vaultArgonSecuritization * 3;
  assert(Math.abs(mining.frame.vaultingApy - ((mining.vaultingPayout / capital) ** 36.5 - 1) * 100) < 1e-6);
  const payout = mining.vaultingPayout;
  const secondStart = sim.limit('vaulting');
  sim.preview('vaulting', secondStart / 2);
  assert.equal(sim.view.vaultingPayout, payout + sim.view.transfer.capital / sim.view.frame.state.argonPriceUsd);
  sim.cancel();
  assert.equal(sim.view.vaultingPayout, payout);
  sim.preview('vaulting', 53.99);
  assert.equal(sim.view.vaultingPayout, payout + sim.view.transfer.capital / sim.view.frame.state.argonPriceUsd);
  assert.equal(sim.view.frame.vaultingApy, 53.99);
});

test('repeated previews and dragging back do not compound transfers', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const baseline = structuredClone(sim.view);
  const first = structuredClone(sim.preview('mining', 19000));
  assert.deepEqual(sim.preview('mining', 19000), first);
  sim.preview('mining', 10000);
  assert.deepEqual(sim.preview('mining', 19000), first);
  assert.deepEqual(sim.preview('mining', miningApy), baseline);
  sim.preview('mining', 15000);
  assert.deepEqual(sim.cancel(), baseline);
});

test('commits continue from the previous result, including receiver increases', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const mining = structuredClone(sim.preview('mining', 53.3));
  sim.commit();
  sim.begin('vaulting');
  assert.equal(sim.limit('vaulting'), mining.frame.vaultingApy);
  const vault = sim.preview('vaulting', mining.frame.vaultingApy / 2);
  assert.equal(vault.frame.state.elapsedDays, mining.frame.state.elapsedDays);
  assert(vault.frame.miningApy > mining.frame.miningApy);
  assert.equal(vault.before.mining, mining.frame.miningApy);
});

test('limits and invalid requests retain valid engine balances', () => {
  for (const side of ['mining', 'vaulting']) {
    const sim = new GrowthSimulation(mainnetBasics);
    const baseline = structuredClone(sim.view);
    assert.deepEqual(sim.preview(side, NaN), baseline);
    assert.deepEqual(sim.preview(side, 1e12), baseline);
    const result = sim.preview(side, 0);
    assert(result.frame[side + 'Apy'] >= minimumApyFor(side) - 1e-8);
    assert(isValidGrowthState(result.frame.state));
    assert(Number.isFinite(result.frame.miningApy));
    assert(Number.isFinite(result.frame.vaultingApy));
  }
});

test('column scenario keeps its fixed assumptions while network time advances', () => {
  for (const side of ['mining', 'vaulting']) {
    const sim = new GrowthSimulation(mainnetBasics);
    const before = structuredClone(sim.view);
    const target = before.frame[side + 'Apy'] * .8;
    const result = sim.preview(side, target);
    assert(Math.abs(result.frame[side + 'Apy'] - target) < 1e-6);
    assert.equal(result.frame.state.elapsedDays, before.frame.state.elapsedDays);
    assert.equal(result.frame.state.argonCirculation, before.frame.state.argonCirculation);
    assert.equal(result.frame.state.argonotCirculation, before.frame.state.argonotCirculation);
    assert.deepEqual(result.frame.operatorAccount, before.frame.operatorAccount);
    assert.equal(result.frame.newArgon, 0);
    assert(result.network.elapsedDays > before.network.elapsedDays);
    assert(result.network.argonCirculation > before.network.argonCirculation);
    assert(result.network.argonotCirculation > before.network.argonotCirculation);
  }
});

for (const first of ['mining', 'vaulting']) {
  const second = first === 'mining' ? 'vaulting' : 'mining';
  test(`${first} can switch before the floor and preserve the current adjustment`, () => {
    const sim = new GrowthSimulation(mainnetBasics);
    const original = structuredClone(sim.view);
    const firstStart = sim.limit(first);
    sim.preview(first, firstStart / 2);
    sim.commit();
    const partial = structuredClone(sim.view);
    assert.equal(sim.canBegin(second), true);
    sim.begin(second);
    assert.deepEqual(sim.view, partial, 'switching alone must not alter days or values');
    const secondStart = sim.limit(second);
    const changed = structuredClone(sim.preview(second, secondStart / 2));
    assert(changed.network.elapsedDays > partial.network.elapsedDays);
    assert.deepEqual(sim.preview(second, secondStart / 2), changed);
    assert.deepEqual(sim.preview(second, secondStart), partial);
    sim.preview(second, secondStart / 2);
    assert.deepEqual(sim.cancel(), partial);
    sim.begin(first);
    assert.deepEqual(sim.view, partial);
    assert.equal(sim.limit(first), partial.frame[first + 'Apy']);
    assert.notDeepEqual(sim.view, original, 'the first adjustment remains committed');
  });

  test(`${first} undo before switching restores the original timeline`, () => {
    const sim = new GrowthSimulation(mainnetBasics);
    const initial = structuredClone(sim.view);
    sim.preview(first, sim.limit(first) / 2);
    sim.cancel();
    sim.begin(second);
    assert.deepEqual(sim.view, initial);
    sim.preview(second, minimumApyFor(second));
    const fresh = new GrowthSimulation(mainnetBasics);
    assert.deepEqual(sim.view, fresh.preview(second, minimumApyFor(second)));
  });

  test(`${first} receiving scale anticipates the endpoint and stays fixed`, () => {
    const sim = new GrowthSimulation(mainnetBasics);
    sim.begin(first);
    const scales = { ...sim.scales };
    sim.preview(first, sim.limit(first) / 2);
    assert.deepEqual(sim.scales, scales);
    sim.preview(first, 53.3);
    assert(sim.view.frame[second + 'Apy'] <= scales[second]);
    assert.deepEqual(sim.scales, scales);
    sim.cancel();
    assert.deepEqual(sim.scales, scales);
  });
}

const { createLogApyScale } = require('../src/lib/logApyScale');

test('log APY scale gives equal distance to equal ratios', () => {
  const scale = createLogApyScale(53.3, 1e12);
  const first = scale.toPosition(1000) - scale.toPosition(100);
  const second = scale.toPosition(10000) - scale.toPosition(1000);
  assert(Math.abs(first - second) < 1e-12);
  assert(Math.abs(scale.toApy(.5) / Math.sqrt(53.3 * 1e12) - 1) < 1e-12);
});

test('log APY mapping round-trips and clamps to exact endpoints', () => {
  for (const maximum of [27000, 31000, 360e9, 1.2e12]) {
    const scale = createLogApyScale(53.3, maximum);
    assert.equal(scale.toApy(0), 53.3);
    assert.equal(scale.toApy(-1), 53.3);
    assert.equal(scale.toApy(1), maximum);
    assert.equal(scale.toApy(2), maximum);
    assert.equal(scale.toPosition(0), 0);
    assert.equal(scale.toPosition(maximum * 2), 1);
    for (let index = 0; index <= 100; index++) {
      const position = index / 100;
      assert(Math.abs(scale.toPosition(scale.toApy(position)) - position) < 1e-12);
    }
    assert.equal(scale.ticks[0], 53.3);
    assert.equal(scale.ticks.at(-1), maximum);
    for (let i = 1; i < scale.ticks.length; i++) {
      assert(scale.toPosition(scale.ticks[i]) - scale.toPosition(scale.ticks[i - 1]) >= .035 - 1e-12);
    }
  }
});

test('log scale endpoints preserve slider undo and switching', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  for (const side of ['mining', 'vaulting']) {
    sim.begin(side);
    const baseline = structuredClone(sim.view);
    const scale = createLogApyScale(minimumApyFor(side), sim.scales[side]);
    sim.preview(side, scale.toApy(scale.toPosition(sim.limit(side)) / 2));
    sim.commit();
    assert.deepEqual(sim.preview(side, scale.toApy(1)), baseline);
    sim.preview(side, scale.toApy(0));
    assert(sim.canBegin(side === 'mining' ? 'vaulting' : 'mining'));
  }
});

test('label count follows track height while gaps gently tighten downward', () => {
  let previousCount = 0;
  for (const height of [400, 550, 850, 1200]) {
    const scale = createLogApyScale(53.3, 31000, height);
    assert.equal(scale.ticks.length, Math.floor(height / 55) + 1);
    assert(scale.ticks.length > previousCount);
    previousCount = scale.ticks.length;
    assert.equal(scale.ticks[0], 53.3);
    assert.equal(scale.ticks.at(-1), 31000);
    let previousGap = 0;
    for (let i = 1; i < scale.ticks.length; i++) {
      const gap = (scale.toPosition(scale.ticks[i]) - scale.toPosition(scale.ticks[i - 1])) * height;
      assert(gap > previousGap);
      assert(gap >= 44 - 1e-8);
      assert(gap < 110);
      previousGap = gap;
    }
  }
});

test('resizing changes labels without changing APY positions', () => {
  const small = createLogApyScale(53.3, 1.2e12, 400);
  const large = createLogApyScale(53.3, 1.2e12, 1200);
  for (const apy of [53.3, 1000, 31000, 1e9, 1.2e12]) {
    assert.equal(small.toPosition(apy), large.toPosition(apy));
  }
});


test('vaulting slider travel matches capital fill throughout each phase', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  for (let phase = 0; phase < 2; phase++) {
    sim.begin('vaulting');
    const scale = createVaultingCapitalScale(sim.view);
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 1, 0.5, 0.1]) {
      const apy = scale.toApy(fraction);
      const result = sim.preview('vaulting', apy);
      const updated = createVaultingCapitalScale(result);
      assert(Math.abs(updated.fraction - fraction) < 1e-10);
      assert(Math.abs(updated.toPosition(result.frame.vaultingApy) - fraction) < 1e-10);
    }
    sim.preview('vaulting', sim.limit('vaulting'));
    assert.equal(createVaultingCapitalScale(sim.view).fraction, 0);
    assert(sim.canBegin('mining'));
    sim.preview('vaulting', scale.toApy(1));
    assert.equal(sim.view.frame.vaultingApy, 53.99);
    sim.preview('mining', 53.3);
  }
});


for (const first of ['mining', 'vaulting']) {
  test(`${first} network accounting matches daily engine and reverses without double issuance`, () => {
    const sim = new GrowthSimulation(mainnetBasics);
    let expected = structuredClone(sim.view.frame.state);
    for (const side of [first, first === 'mining' ? 'vaulting' : 'mining', first]) {
      const baseline = structuredClone(sim.view);
      const upper = sim.limit(side);
      let ending;
      for (const day of iterateGrowthCycle({ ...expected, activeSide: side, status: 'running' })) {
        ending = day;
        if (day.outcome !== 'in-progress') break;
      }
      expected = ending.next;
      const partial = structuredClone(sim.preview(side, Math.sqrt(upper * minimumApyFor(side))));
      assert.deepEqual(sim.preview(side, Math.sqrt(upper * minimumApyFor(side))), partial);
      assert.deepEqual(sim.cancel(), baseline);
      sim.preview(side, minimumApyFor(side));
      for (const key of ['elapsedDays', 'argonCirculation', 'argonotCirculation', 'argonPriceUsd', 'argonotPriceUsd', 'networkValueUsd']) {
        assert(Math.abs(sim.view.network[key] - expected[key]) < 1e-7, key);
      }
      assert.deepEqual(sim.preview(side, upper), baseline);
      sim.preview(side, minimumApyFor(side));
    }
  });
}


test('day cards follow completed engine days and preserve history across phases and undo', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const initial = structuredClone(sim.view);
  assert.equal(initial.days.length, 1);
  assert.equal(initial.days[0].day, 0);
  assert.equal(initial.days[0].date, new Date(mainnetBasics.lastUpdatedAt).toISOString());
  const scale = createVaultingCapitalScale(initial);
  const partial = sim.preview('vaulting', scale.toApy(0.5));
  assert.equal(partial.days.length, Math.floor(partial.network.elapsedDays) + 1);
  sim.preview('vaulting', 53.99);
  const completed = structuredClone(sim.view.days);
  const expectedDays = [initial.days[0]];
  for (const result of iterateGrowthCycle({ ...initial.frame.state, activeSide: 'vaulting' })) {
    const date = new Date(mainnetBasics.lastUpdatedAt);
    date.setUTCDate(date.getUTCDate() + result.next.elapsedDays);
    expectedDays.push({ day: result.next.elapsedDays, date: date.toISOString(),
      miningApy: Math.min(require('../src/lib/exponentialTriggers').calculateNewCohortMiningApy(result.next), 1e12),
      vaultingApy: Math.min(result.next.returns.vaultingApy, 1e12) });
    if (result.outcome !== 'in-progress') break;
  }
  assert.deepEqual(completed, expectedDays);
  sim.preview('vaulting', scale.toApy(0.25));
  assert(sim.view.days.length < completed.length);
  assert.deepEqual(sim.cancel().days, initial.days);
  sim.preview('vaulting', 53.99);
  sim.preview('mining', 53.3);
  assert.deepEqual(sim.view.days.slice(0, completed.length), completed);
  assert.equal(new Set(sim.view.days.map(day => day.day)).size, sim.view.days.length);
  assert.equal(sim.view.days.length, Math.floor(sim.view.network.elapsedDays) + 1);
  assert.deepEqual(sim.cancel().days, completed);
});


test('switching mid-day completes only the pending settlement before the new side advances', () => {
  const sim = new GrowthSimulation(mainnetBasics);
  const initial = structuredClone(sim.view);
  const vaultDays = [];
  for (const result of iterateGrowthCycle({ ...initial.frame.state, activeSide: 'vaulting' })) {
    vaultDays.push(result.next);
    if (result.outcome !== 'in-progress') break;
  }
  const fraction = 2.5 / vaultDays.length;
  sim.preview('vaulting', createVaultingCapitalScale(initial).toApy(fraction));
  const partial = structuredClone(sim.view);
  assert(Math.abs(partial.network.elapsedDays - 2.5) < 1e-9);
  sim.begin('mining');
  assert.deepEqual(sim.view, partial);
  let expected = vaultDays[2];
  for (const result of iterateGrowthCycle({ ...expected, activeSide: 'mining', status: 'running' })) {
    expected = result.next;
    if (result.outcome !== 'in-progress') break;
  }
  sim.preview('mining', minimumApyFor('mining'));
  for (const key of ['elapsedDays', 'argonCirculation', 'argonotCirculation', 'networkValueUsd']) {
    assert(Math.abs(sim.view.network[key] - expected[key]) < 1e-7, key);
  }
  assert.equal(sim.view.days.length, expected.elapsedDays + 1);
  assert.equal(new Set(sim.view.days.map(day => day.day)).size, sim.view.days.length);
  assert.deepEqual(sim.cancel(), partial);
});
