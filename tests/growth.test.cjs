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

const { GrowthGame, GAME_TARGET, vaultCollateral } = require('../src/lib/growthGame');
test('competition previews use the same engine settlement for network and account', () => {
  const game = new GrowthGame(mainnetBasics);
  assert.equal(game.bitcoin, mainnetBasics.vaulting.bitcoinLocked);
  for (const side of ['mining', 'vaulting']) {
    const before = structuredClone(game.view);
    game.increment(side);
    const reference = referencePortfolioDays(before.frame.state, before.frame.operatorAccount, side, side === 'mining' ? game.miners : undefined, side === 'vaulting' ? game.bitcoin : undefined);
    assert(game.value(side) > (side === 'mining' ? before.frame.state.seatCount : before.frame.state.bitcoinLocked));
    const settled = reference.find(day => day.state.elapsedDays === game.view.network.elapsedDays);
    assert.deepEqual(game.view.frame.state, settled.state);
    assert.deepEqual(game.view.frame.operatorAccount, settled.account);
    assert.equal(game.view.network, game.view.frame.state);
  }
});
test('initial mining slider offers competition growth instead of a one-miner bid repricing', () => {
  const game = new GrowthGame(mainnetBasics);
  const baseline = structuredClone(game.view);
  const { minimum, maximum, settlements } = game.bounds('mining');
  assert.equal(minimum, mainnetBasics.mining.nextEpochSeatCount);
  assert(maximum > minimum * 1.1, 'initial mining range must offer a meaningful increase in miners');
  assert(settlements.length > 2, 'the slider must offer intermediate competition adjustments');
  const bidPerMiner = baseline.frame.state.argonsBidPerSeat;
  let previousApy = game.apy('mining');
  let previousCount = minimum;
  let previousBids = baseline.frame.state.miningAuctionRevenue;
  for (const miners of settlements.slice(1)) {
    game.setValue('mining', miners);
    const state = game.view.frame.state;
    assert.equal(game.miners, miners);
    assert(miners > previousCount);
    assert(state.miningAuctionRevenue > previousBids);
    assert(Math.abs(state.argonsBidPerSeat - bidPerMiner) < 1e-8, 'competition must not be replaced by higher bids per miner');
    assert(Math.abs(state.miningAuctionRevenue - miners * bidPerMiner) < 1e-6);
    assert.equal(state.baseArgonRewards, baseline.frame.state.baseArgonRewards);
    assert.equal(state.baseArgonotRewards, baseline.frame.state.baseArgonotRewards);
    assert(game.apy('mining') < previousApy, 'more miners dilute the same rewards');
    assertGameAccounting(game, baseline.network.argonCirculation);
    previousApy = game.apy('mining'); previousCount = miners; previousBids = state.miningAuctionRevenue;
  }
  assert(game.qualifies('mining'));
  game.setValue('mining', minimum);
  assert.deepEqual(game.view, baseline);
});
test('final competition steps qualify, and reversing a drag restores the phase baseline', () => {
  for (const side of ['mining', 'vaulting']) {
    const game = new GrowthGame(mainnetBasics);
    const start = game.minimum(side), before = structuredClone(game.view);
    game.setValue(side, game.targetValue(side));
    assert(game.qualifies(side), `${side}: ${game.apy(side)}`);
    if (side === 'mining') {
      assert(Number.isInteger(game.miners));
      const endpoint = game.miners;
      game.setValue(side, endpoint - 1);
      assert.equal(game.miners, endpoint - 1, 'one miner below the endpoint must be selected exactly');
      assert(game.apy('mining') > GAME_TARGET);
    }
    game.setValue(side, start);
    assert.deepEqual(game.view, before);
    for (let i = 0; i < 1000 && !game.qualifies(side); i++) game.increment(side);
    assert(game.qualifies(side));
  }
});
test('lock-in never reports a false win when existing economics reach BTC capacity', () => {
  const game = new GrowthGame(mainnetBasics);
  game.setValue('mining', game.targetValue('mining'));
  assert(!game.won);
  let turns = 0;
  while (!game.won && turns++ < 300) {
    const side = game.qualifies('mining') ? 'vaulting' : 'mining';
    const day = game.view.network.elapsedDays;
    game.setValue(side, game.targetValue(side));
    if (game.view.network.elapsedDays === day) game.advanceDay(side);
    if (game.bitcoin >= 17_500_000 - 1e-6) break;
  }
  assert(!game.won);
  assert(Math.abs(game.bitcoin - 17_500_000) < 1e-6);
  assert(game.apy('vaulting') > GAME_TARGET);
});
test('game target uses numerical returns, rejects invalid input, and handles zero starting BTC', () => {
  const game = new GrowthGame(mainnetBasics);
  const baseline = structuredClone(game.view);
  game.setValue('mining', NaN);
  game.setValue('vaulting', Infinity);
  assert.deepEqual(game.view, baseline);
  game.view.frame.miningApy = GAME_TARGET + .001;
  game.view.frame.vaultingApy = GAME_TARGET;
  assert(!game.won, 'a displayed rounded target must not count as a win');
  game.view.frame.miningApy = GAME_TARGET;
  assert(game.won);
  const zero = new GrowthGame({ ...mainnetBasics, vaulting: { ...mainnetBasics.vaulting, bitcoinLocked: 0 } });
  // A synthetic high-earnings vault with no BTC exercises the nonzero seed.
  zero.view.vaultingPayout = zero.view.frame.state.vaultArgonSecuritization * 3 * 2;
  zero.view.frame.vaultingApy = (2 ** 36.5 - 1) * 100;
  zero.increment('vaulting');
  assert.equal(zero.bitcoin, 0, 'the engine does not invent a seed BTC deposit');
  assert.equal(zero.bounds('vaulting').maximum, 0);
  assert(zero.advanceDay('vaulting'), 'daily settlement remains available without slider travel');
  assert(Number.isFinite(zero.apy('vaulting')));
});

const { advanceOperatorAccount } = require('../src/lib/growthOperatorAccount');
function referencePortfolioDays(state, account, side, miningSeats, bitcoinTarget) {
  const days = [{ state, account }];
  let previousMiningMint = 0, previousArgonotMint = 0;
  for (const result of iterateGrowthCycle({ ...state, activeSide: side, status: 'running' }, { miningSeats, bitcoinTarget })) {
    if (!isValidGrowthState(result.next)) break;
    account = advanceOperatorAccount(account, result.next,
      result.miningMintLoaded - previousMiningMint,
      result.argonotMintLoaded - previousArgonotMint);
    previousMiningMint = result.miningMintLoaded;
    previousArgonotMint = result.argonotMintLoaded;
    days.push({ state: result.next, account });
    if (result.outcome !== 'in-progress') break;
  }
  return days;
}
function assertPortfolioMatchesDays(game, days) {
  const position = game.view.network.elapsedDays - days[0].state.elapsedDays;
  const index = Math.min(days.length - 1, Math.floor(position + 1e-9));
  const from = days[index].account, to = days[Math.min(index + 1, days.length - 1)].account;
  const fraction = Math.max(0, position - index);
  assert.deepEqual(game.view.frame.operatorAccount, from);
  assert(Math.abs(game.view.frame.operatorValue - (from.value + (to.value - from.value) * fraction)) < 1e-8);
}
for (const side of ['mining', 'vaulting']) {
  test(`${side} portfolio follows daily account income, reverses, and restarts`, () => {
    const game = new GrowthGame(mainnetBasics);
    const baseline = structuredClone(game.view);
    const days = referencePortfolioDays(baseline.frame.state, baseline.frame.operatorAccount, side);
    const minimum = game.minimum(side);
    game.increment(side);
    assertPortfolioMatchesDays(game, referencePortfolioDays(baseline.frame.state, baseline.frame.operatorAccount, side, side === 'mining' ? game.miners : undefined));
    assert.notEqual(game.view.frame.operatorValue, baseline.frame.operatorValue);
    const value = game.value(side), preview = structuredClone(game.view);
    game.setValue(side, value);
    assert.deepEqual(game.view, preview, 'repeating a preview cannot compound income');
    game.setValue(side, game.targetValue(side));
    assertPortfolioMatchesDays(game, days);
    game.setValue(side, value);
    assert.deepEqual(game.view, preview, 'backtracking restores the same daily value');
    game.setValue(side, minimum);
    assert.deepEqual(game.view, baseline);
    const restarted = new GrowthGame(mainnetBasics);
    assert.equal(restarted.view.frame.operatorAccount.initialCapital, 10_000);
    assert(Math.abs(restarted.view.frame.operatorValue - 10_000) < 1e-8);
  });
  test(`${side} portfolio preserves settled days when switching sides`, () => {
    const game = new GrowthGame(mainnetBasics);
    const initial = structuredClone(game.view);
    game.increment(side);
    const firstDays = referencePortfolioDays(initial.frame.state, initial.frame.operatorAccount, side, side === 'mining' ? game.miners : undefined);
    const elapsed = game.view.network.elapsedDays;
    assert(Number.isInteger(elapsed), 'competition previews select complete daily settlements');
    const index = Math.floor(elapsed + 1e-9);
    const from = firstDays[index];
    const nextSide = side === 'mining' ? 'vaulting' : 'mining';
    const before = structuredClone(game.view);
    game.begin(nextSide);
    assert.deepEqual(game.view, before, 'switching alone earns nothing');
    const minimum = game.minimum(nextSide);
    game.increment(nextSide);
    assertPortfolioMatchesDays(game, referencePortfolioDays(from.state, from.account, nextSide, nextSide === 'mining' ? game.miners : undefined));
    game.setValue(nextSide, game.targetValue(nextSide));
    assertPortfolioMatchesDays(game, referencePortfolioDays(from.state, from.account, nextSide,
      nextSide === 'mining' ? game.miners : undefined, nextSide === 'vaulting' ? game.bitcoin : undefined));
    game.setValue(nextSide, minimum);
    assert.deepEqual(game.view, before, 'undo preserves the pre-switch settled value');
  });
}

const { GameSession } = require('../src/lib/gameSession');
test('reading either panel bounds does not commit a phase or change reverse-drag behavior', () => {
  const game = new GrowthGame(mainnetBasics);
  const original = structuredClone(game.view);
  const minimum = game.miners;
  game.increment('mining');
  const preview = structuredClone(game.view);
  for (let i = 0; i < 5; i++) { game.bounds('vaulting'); game.bounds('mining'); }
  assert.deepEqual(game.view, preview);
  game.setValue('mining', minimum);
  assert.deepEqual(game.view, original);
});
test('undo restores the full portfolio and network across clicks and side changes', () => {
  const session = new GameSession(mainnetBasics);
  const start = structuredClone(session.game.view);
  session.increment('mining');
  const mining = structuredClone(session.game.view);
  session.increment('vaulting');
  assert(session.canUndo);
  assert.notDeepEqual(session.game.view, mining);
  session.undo();
  assert.deepEqual(session.game.view, mining);
  assert.equal(session.actions.length, 1);
  session.undo();
  assert.deepEqual(session.game.view, start);
  assert.equal(session.actions.length, 0);
  assert(!session.canUndo);
});
test('a continuous drag is one undo action and can be replayed exactly', () => {
  const session = new GameSession(mainnetBasics);
  session.increment('mining');
  const baseline = structuredClone(session.game.view);
  const start = session.game.bitcoin;
  session.beginDrag();
  const target = session.game.bounds('vaulting').maximum;
  session.drag('vaulting', target);
  session.drag('vaulting', (start + target) / 2);
  session.drag('vaulting', target);
  session.endDrag();
  const afterDrag = structuredClone(session.game.view);
  assert.equal(session.actions.length, 2);
  session.advanceDay('mining');
  session.undo();
  assert.deepEqual(session.game.view, afterDrag);
  session.undo();
  assert.deepEqual(session.game.view, baseline);
  assert.equal(session.actions.length, 1);
});
test('invalid gestures and benchmark clicks do not create undo entries', () => {
  const session = new GameSession(mainnetBasics);
  assert(!session.drag('vaulting', NaN));
  assert(!session.canUndo);
  session.beginDrag();
  session.endDrag();
  assert(!session.canUndo);
  session.beginDrag();
  session.drag('mining', session.game.bounds('mining').maximum);
  session.endDrag();
  const before = structuredClone(session.game.view);
  assert(!session.increment('mining'));
  assert.deepEqual(session.game.view, before);
  session.undo();
  assert(!session.canUndo);
});

for (const side of ['mining', 'vaulting']) {
  test(`${side} repeated backward gestures use the cycle baseline and keep transfers nonnegative`, () => {
    const session = new GameSession(mainnetBasics);
    const baseline = structuredClone(session.game.cycleBaseline(side));
    const start = session.game.value(side);
    for (const multiplier of [1.4, 1.2, 1]) {
      session.beginDrag();
      assert.deepEqual(session.game.cycleBaseline(side), baseline);
      session.drag(side, start * multiplier);
      session.endDrag();
      const current = session.game.view;
      assert(session.game.value(side) >= start);
      assert(current.vaultingPayout - baseline.view.vaultingPayout >= 0);
      assert(current.frame.state.pendingMiningMint - baseline.view.frame.state.pendingMiningMint >= 0);
    }
    assert.deepEqual(session.game.view, baseline.view);
    assert(session.undo());
    assert(session.game.value(side) > start);
    assert.deepEqual(session.game.cycleBaseline(side), baseline);
    const other = side === 'mining' ? 'vaulting' : 'mining';
    const next = structuredClone(session.game.view);
    assert.deepEqual(session.game.cycleBaseline(other).view, next);
  });
  test(`${side} out-and-back drag creates no undo action`, () => {
    const session = new GameSession(mainnetBasics);
    const before = structuredClone(session.game.view);
    const start = session.game.value(side);
    session.beginDrag();
    session.drag(side, start * 1.1);
    session.drag(side, start);
    session.endDrag();
    assert.equal(session.canUndo, false);
    assert.deepEqual(session.actions, []);
    assert.deepEqual(session.game.view, before);
    assert.equal(session.undo(), false);
  });
  for (const previousSide of ['mining', 'vaulting']) {
    test(`${side} no-op drag preserves previous ${previousSide} undo and phase`, () => {
      const session = new GameSession(mainnetBasics);
      const initial = structuredClone(session.game.view);
      session.increment(previousSide);
      const before = structuredClone(session.game.view);
      const actions = structuredClone(session.actions);
      const bounds = session.game.bounds(previousSide);
      const start = session.game.value(side);
      session.beginDrag();
      session.drag(side, start * 1.1);
      session.drag(side, start);
      session.endDrag();
      assert(session.canUndo);
      assert.deepEqual(session.actions, actions);
      assert.deepEqual(session.game.view, before);
      assert.deepEqual(session.game.bounds(previousSide), bounds);
      assert(session.undo());
      assert.deepEqual(session.game.view, initial);
      assert.equal(session.canUndo, false);
    });
  }
}

function assertGameAccounting(game, startingCirculation) {
  const { state } = game.view.frame;
  const { issuance } = game.view;
  const expected = startingCirculation + issuance.mining + issuance.bitcoin - issuance.burned;
  assert(Math.abs(state.argonCirculation - expected) < Math.max(1e-6, expected * 1e-12));
  assert.equal(game.view.network, state);
  assert.equal(state.elapsedDays, game.view.frame.operatorAccount.elapsedDays);
  assert.equal(state.seatCount, game.miners);
  assert.equal(state.bitcoinLocked, game.bitcoin);
  assert.equal(game.view.vaultingPayout, vaultCollateral(state).total + state.miningAuctionRevenue * calculateVaultRevenueShare(state));
  assert(isValidGrowthState(state));
  // The saved snapshot can start with a shortage; newly simulated days must
  // keep allocated ARGN within supply after its 10% liquid reserve.
  if (state.elapsedDays > 0) {
    const allocated = state.miningAuctionRevenue + state.vaultArgonSecuritization + state.bondCapital;
    assert(allocated <= state.argonCirculation * .9 + Math.max(1e-6, state.argonCirculation * 1e-10));
  }
}
test('supply and collateral reconcile through BTC capacity and safe daily advances', () => {
  const session = new GameSession(mainnetBasics);
  const starting = session.game.view.network.argonCirculation;
  for (let i = 0; i < 100 && session.game.bitcoin < 17_500_000 - 1e-6; i++) {
    const side = session.game.qualifies('mining') ? 'vaulting' : 'mining';
    const beforeDay = session.game.view.network.elapsedDays;
    session.beginDrag();
    session.drag(side, session.game.bounds(side).maximum);
    session.endDrag();
    if (session.game.view.network.elapsedDays === beforeDay) session.advanceDay(side);
    assertGameAccounting(session.game, starting);
  }
  assert(Math.abs(session.game.bitcoin - 17_500_000) < 1e-6);
  const before = structuredClone(session.game.view);
  const collateral = vaultCollateral(before.frame.state);
  assert.equal(collateral.total, collateral.argons + collateral.argonots);
  assert.equal(collateral.argonots, collateral.argons * 2);
  for (const side of ['vaulting', 'mining']) {
    if (session.advanceDay(side)) {
      assert.equal(session.game.view.network.elapsedDays, before.network.elapsedDays + 1);
      assert(session.game.apy('mining') > 40);
      assertGameAccounting(session.game, starting);
      assert(session.undo());
      assert.deepEqual(session.game.view, before, 'safe daily actions replay without double minting');
    } else assert.deepEqual(session.game.view, before, 'rejected advances preserve the network and portfolio');
  }
});
test('previewing and backtracking do not compound supply issuance', () => {
  const game = new GrowthGame(mainnetBasics);
  const starting = game.view.network.argonCirculation;
  const baseline = structuredClone(game.view);
  const target = game.targetValue('vaulting');
  game.setValue('vaulting', target);
  const preview = structuredClone(game.view);
  assertGameAccounting(game, starting);
  game.setValue('vaulting', target);
  assert.deepEqual(game.view, preview);
  game.setValue('vaulting', game.minimum('vaulting'));
  assert.deepEqual(game.view, baseline);
  game.setValue('vaulting', target);
  assert.deepEqual(game.view, preview);
});

test('every whole mining count is selectable and reverses without compounding supply or income', () => {
  const game = new GrowthGame(mainnetBasics);
  const baseline = structuredClone(game.view);
  const { minimum, maximum } = game.bounds('mining');
  const bid = baseline.frame.state.argonsBidPerSeat;
  const snapshots = new Map();
  let lastApy = game.apy('mining');
  for (let miners = minimum + 1; miners <= maximum; miners++) {
    game.setValue('mining', miners);
    assert.equal(game.miners, miners, `requested ${miners} miners`);
    assert.equal(game.view.frame.state.seatCount, miners);
    assert(game.apy('mining') < lastApy);
    assert(Math.abs(game.view.frame.state.miningAuctionRevenue - miners * bid) < 1e-6);
    assertGameAccounting(game, baseline.network.argonCirculation);
    snapshots.set(miners, structuredClone(game.view));
    lastApy = game.apy('mining');
  }
  assert.equal(snapshots.get(247).network.elapsedDays, 1);
  assert.equal(snapshots.get(248).network.elapsedDays, 1);
  assert.equal(snapshots.get(260).network.elapsedDays, 1);
  assert.equal(snapshots.get(261).network.elapsedDays, 2);
  for (let miners = maximum; miners > minimum; miners--) {
    game.setValue('mining', miners);
    assert.deepEqual(game.view, snapshots.get(miners));
  }
  game.setValue('mining', minimum);
  assert.deepEqual(game.view, baseline);
});
test('a fine mining drag replays exactly after switching sides and undoing', () => {
  const session = new GameSession(mainnetBasics);
  const baseline = structuredClone(session.game.view);
  session.beginDrag();
  for (const miners of [247, 248, 260, 261, 262, 248]) {
    assert(session.drag('mining', miners));
    assert.equal(session.game.miners, miners);
  }
  session.endDrag();
  const preview = structuredClone(session.game.view);
  assert.equal(session.actions.length, 1);
  assert.equal(session.actions[0].value, 248);
  session.increment('vaulting');
  assert(session.undo());
  assert.deepEqual(session.game.view, preview);
  assert(session.undo());
  assert.deepEqual(session.game.view, baseline);
});
test('exact miner targets preserve the daily growth limit across multiple settlements', () => {
  const game = new GrowthGame(mainnetBasics);
  const baseline = structuredClone(game.view);
  const target = game.bounds('mining').maximum;
  const reference = referencePortfolioDays(baseline.frame.state, baseline.frame.operatorAccount, 'mining', target);
  for (let i = 1; i < reference.length; i++) {
    assert(reference[i].state.seatCount <= Math.ceil(reference[i - 1].state.seatCount * 1.5));
    assert(reference[i].state.seatCount <= target, 'the engine must not overshoot the requested count');
    assert.equal(reference[i].state.elapsedDays, reference[i - 1].state.elapsedDays + 1);
  }
  game.setValue('mining', target);
  assert.deepEqual(game.view.frame.state, reference.at(-1).state);
  assert.deepEqual(game.view.frame.operatorAccount, reference.at(-1).account);
  assert(game.view.network.elapsedDays > 1);
});

test('fractional BTC selections settle the requested deposit without jumping daily batches', () => {
  const game = new GrowthGame(mainnetBasics);
  const baseline = structuredClone(game.view);
  const start = game.bitcoin;
  const price = baseline.frame.state.bitcoinPriceUsd / baseline.frame.state.argonPriceUsd;
  const selections = [start + .00000001, start + .001, start + .01, start + .02, 2.5, 3, 4, 5, 10, game.bounds('vaulting').maximum];
  const previews = new Map();
  for (const bitcoin of selections) {
    game.setValue('vaulting', bitcoin);
    assert.equal(game.bitcoin, bitcoin);
    assert.equal(game.view.frame.state.bitcoinLocked, bitcoin);
    const expectedMint = (bitcoin - start) * price;
    assert(Math.abs(game.view.issuance.bitcoin - expectedMint) <= Math.max(1e-6, expectedMint * 1e-12));
    assertGameAccounting(game, baseline.network.argonCirculation);
    previews.set(bitcoin, structuredClone(game.view));
  }
  assert(game.qualifies('vaulting'));
  for (const bitcoin of selections.reverse()) {
    game.setValue('vaulting', bitcoin);
    assert.deepEqual(game.view, previews.get(bitcoin), 'backtracking must not compound issuance or income');
  }
  game.setValue('vaulting', start);
  assert.deepEqual(game.view, baseline);
});
test('small BTC deposits fund only their corresponding collateral growth', () => {
  const game = new GrowthGame(mainnetBasics);
  const start = game.bitcoin;
  const originalCollateral = game.view.frame.state.vaultArgonSecuritization;
  game.setValue('vaulting', start + .001);
  const smaller = game.view.frame.state.vaultArgonSecuritization - originalCollateral;
  game.setValue('vaulting', start + .002);
  const larger = game.view.frame.state.vaultArgonSecuritization - originalCollateral;
  assert(smaller > 0);
  assert(Math.abs(larger / smaller - 2) < 1e-6);
});
test('a fractional BTC drag is one undo action and replays after switching sides', () => {
  const session = new GameSession(mainnetBasics);
  const baseline = structuredClone(session.game.view);
  const start = session.game.bitcoin;
  session.beginDrag();
  for (const bitcoin of [start + .001, start + .002, start + .01, start + .001]) {
    assert(session.drag('vaulting', bitcoin));
    assert.equal(session.game.bitcoin, bitcoin);
  }
  session.endDrag();
  const preview = structuredClone(session.game.view);
  assert.equal(session.actions.length, 1);
  assert.equal(session.actions[0].value, start + .001);
  session.increment('mining');
  assert(session.undo());
  assert.deepEqual(session.game.view, preview);
  assert(session.undo());
  assert.deepEqual(session.game.view, baseline);
});

test('326 miners followed by 9.8644 BTC cannot reproduce the negative Mining APY', () => {
  const game = new GrowthGame(mainnetBasics);
  game.setValue('mining', 326);
  assert.equal(game.miners, 326);
  game.setValue('vaulting', 9.864413335602059);
  assert.equal(game.bitcoin, 9.864413335602059);
  assert.equal(game.miners, 326);
  assert(game.apy('mining') > 40);
  assert(game.view.days.every(day => day.miningApy > 40));
});

test('partial Mining then BTC slider adjustments preserve miners and safe APY on every settled day', () => {
  for (const miningFraction of [.1, .25, .5, .75, 1]) {
    for (const bitcoinFraction of [.01, .1, .25, .5, .75, 1]) {
      const session = new GameSession(mainnetBasics);
      let bounds = session.game.bounds('mining');
      session.beginDrag();
      session.drag('mining', Math.round(bounds.minimum + (bounds.maximum - bounds.minimum) * miningFraction));
      session.endDrag();
      const baseline = structuredClone(session.game.view);
      const miners = session.game.miners;
      bounds = session.game.bounds('vaulting');
      const requested = bounds.minimum + (bounds.maximum - bounds.minimum) * bitcoinFraction;
      session.beginDrag();
      assert(session.drag('vaulting', requested));
      session.endDrag();
      assert.equal(session.game.bitcoin, requested);
      assert.equal(session.game.miners, miners, `BTC must preserve miners for fractions ${miningFraction}/${bitcoinFraction}`);
      assert(session.game.apy('mining') > 40);
      assert(session.game.view.days.every(day => day.miningApy > 40), 'all daily settlements obey the floor');
      const endpoint = structuredClone(session.game.view);
      assert(session.undo());
      assert.deepEqual(session.game.view, baseline);
      session.beginDrag(); session.drag('vaulting', requested); session.endDrag();
      assert.deepEqual(session.game.view, endpoint, 'undo and replay retain the safe settlement');
    }
  }
});

test('Mining slider keeps later-phase endpoints and repeated oversized drags above 40% APY', () => {
  const session = new GameSession(mainnetBasics);
  let checkedLatePhase = false;
  for (let i = 0; i < 40 && session.game.bitcoin < 17_500_000; i++) {
    const side = session.game.qualifies('mining') ? 'vaulting' : 'mining';
    const baseline = structuredClone(session.game.view);
    const { minimum, maximum } = session.game.bounds(side);
    session.beginDrag();
    session.drag(side, Number.MAX_SAFE_INTEGER);
    if (side === 'mining' && maximum > minimum && session.game.miners !== baseline.frame.state.seatCount) {
      assert.equal(session.game.miners, maximum);
      assert(session.game.apy('mining') > 40, `Mining endpoint below floor at day ${session.game.view.network.elapsedDays}`);
      const endpoint = structuredClone(session.game.view);
      session.drag(side, minimum + Math.floor((maximum - minimum) / 2));
      assert(session.game.apy('mining') > 40);
      session.drag(side, Number.MAX_SAFE_INTEGER);
      assert.deepEqual(session.game.view, endpoint, 'repeated dragging preserves the capped endpoint and accounting');
      session.endDrag();
      assert(session.undo());
      assert.deepEqual(session.game.view, baseline);
      session.beginDrag();
      session.drag(side, Number.MAX_SAFE_INTEGER);
      assert.deepEqual(session.game.view, endpoint, 'undo and replay preserve the safe endpoint');
      if (minimum > 800_000) checkedLatePhase = true;
    }
    session.endDrag();
    if (session.game.view.network.elapsedDays === baseline.network.elapsedDays) session.advanceDay(side);
  }
  assert(checkedLatePhase, 'exercise the large-miner phases that previously produced negative returns');
});

test('custom starting capital survives settlement and undo without changing the network snapshot', () => {
  for (const capital of [1_000, 25_000, 100_000]) {
    const session = new GameSession(mainnetBasics, capital);
    const initial = structuredClone(session.game.view);
    assert.equal(initial.frame.operatorAccount.initialCapital, capital);
    assert.equal(initial.frame.operatorAccount.miningAllocation, 0.5);
    assert.deepEqual(initial.network, new GrowthGame(mainnetBasics).view.network);
    assert(session.advanceDay('mining'));
    assert.equal(session.game.view.frame.operatorAccount.initialCapital, capital);
    assert(session.undo());
    assert.deepEqual(session.game.view, initial);
  }
});


test('daily advances keep Mining APY above 40% and preserve safe advances on undo', () => {
  const { projectGameDays } = require('../src/lib/gamePortfolio');
  const { calculateNewCohortMiningApy } = require('../src/lib/exponentialTriggers');
  const session = new GameSession(mainnetBasics);
  const initialSupply = session.game.view.network.argonCirculation;
  // Resume playback after slider use, matching the later-phase regression.
  for (let i = 0; i < 12; i++) {
    const side = session.game.qualifies('mining') ? 'vaulting' : 'mining';
    session.beginDrag(); session.drag(side, session.game.bounds(side).maximum); session.endDrag();
  }
  let active = 'mining', unsafeDays = 0, advances = 0;
  for (; advances < 3650 && !session.game.won && session.game.bitcoin < 17_500_000; advances++) {
    if (session.game.qualifies(active)) active = active === 'mining' ? 'vaulting' : 'mining';
    const before = structuredClone(session.game.view);
    const raw = projectGameDays(before.frame.state, before.frame.operatorAccount, active);
    const rawDay = raw.next();
    raw.return();
    const wouldOvershoot = !rawDay.done && calculateNewCohortMiningApy(rawDay.value.state) <= 40;
    if (wouldOvershoot) unsafeDays++;
    if (!session.advanceDay(active)) {
      assert.deepEqual(session.game.view, before, 'rejected advance must not change ledgers');
      active = active === 'mining' ? 'vaulting' : 'mining';
      if (!session.advanceDay(active)) {
        assert.deepEqual(session.game.view, before);
        break;
      }
    }
    {
      const capped = structuredClone(session.game.view);
      assert.equal(capped.network.elapsedDays, before.network.elapsedDays + 1, 'playback keeps a single-day advance');
      assert(session.undo());
      assert.deepEqual(session.game.view, before);
      assert(session.advanceDay(active));
      assert.deepEqual(session.game.view, capped, 'safe advance replays deterministically');
    }
    assert(session.game.apy('mining') > 40, `unsafe APY at day ${session.game.view.network.elapsedDays}`);
    assertGameAccounting(session.game, initialSupply);
  }
  assert(unsafeDays > 0, 'exercise daily steps that would otherwise overshoot the floor');
  assert(advances < 3650, 'playback reaches completion, capacity, or a safe stop');
});


test('Play shares slider settlements, progresses beyond day three, and preserves undo', () => {
  const playback = new GameSession(mainnetBasics);
  const manual = new GameSession(mainnetBasics);
  let active = 'mining', steps = 0;
  const advanceManually = side => {
    const maximum = manual.game.bounds(side).maximum;
    if (maximum > manual.game.value(side)) {
      manual.beginDrag();
      const changed = manual.drag(side, maximum);
      manual.endDrag();
      if (changed) return true;
    }
    return manual.advanceDay(side);
  };
  while (!playback.game.won && playback.game.bitcoin < 17_500_000 - 1e-6 && steps < 100) {
    if (playback.game.qualifies(active)) active = active === 'mining' ? 'vaulting' : 'mining';
    const before = structuredClone(playback.game.view);
    const advanced = playback.advanceCompetition(active);
    assert.equal(advanced, advanceManually(active));
    if (!advanced) {
      active = active === 'mining' ? 'vaulting' : 'mining';
      const fallback = playback.advanceCompetition(active);
      assert.equal(fallback, advanceManually(active));
      if (!fallback) break;
    }
    steps++;
    assert.deepEqual(playback.game.view, manual.game.view, `playback/manual mismatch at step ${steps}`);
    assert.deepEqual(playback.actions, manual.actions);
    assert(playback.game.apy('mining') > 40);
    const endpoint = structuredClone(playback.game.view);
    assert(playback.undo());
    assert.deepEqual(playback.game.view, before);
    assert(playback.advanceCompetition(active));
    assert.deepEqual(playback.game.view, endpoint);
    if (steps === 1) assert.equal(playback.game.view.network.elapsedDays, 3);
    if (steps === 2) {
      assert(playback.game.view.network.elapsedDays > before.network.elapsedDays, 'Play must progress through the first Vaulting adjustment');
      assert.equal(playback.game.miners, before.frame.state.seatCount, 'Vaulting preserves the selected miners');
    }
  }
  assert(steps > 2 && steps < 100);
  assert(playback.game.view.network.elapsedDays > 64, 'playback progresses through later rollover phases');
  assert(playback.game.won || playback.game.bitcoin >= 17_500_000 - 1e-6 ||
    (!playback.advanceCompetition('mining') && !playback.advanceCompetition('vaulting')));
});


test('Mining slider remains usable after repeated cohort rollover and stops at the first miner below 53.99%', () => {
  const session = new GameSession(mainnetBasics);
  for (let i = 0; i < 8; i++) {
    const side = session.game.qualifies('mining') ? 'vaulting' : 'mining';
    session.beginDrag(); session.drag(side, session.game.bounds(side).maximum); session.endDrag();
  }
  const baseline = structuredClone(session.game.view);
  assert(baseline.network.elapsedDays >= 50, 'exercise multiple complete cohort rollovers');
  assert(session.game.apy('mining') > GAME_TARGET);
  const { minimum, maximum } = session.game.bounds('mining');
  assert(maximum > minimum, 'rollover must not collapse the slider range');
  session.beginDrag();
  assert(session.drag('mining', minimum + 1));
  assert.equal(session.game.miners, minimum + 1);
  assert(session.drag('mining', maximum - 1));
  assert.equal(session.game.miners, maximum - 1);
  assert(session.game.apy('mining') >= GAME_TARGET, 'one fewer miner remains above the target');
  session.drag('mining', Number.MAX_SAFE_INTEGER);
  assert.equal(session.game.miners, maximum);
  assert(session.game.apy('mining') < GAME_TARGET, 'endpoint is the first whole miner below target');
  assert(session.game.apy('mining') > 40);
  const endpoint = structuredClone(session.game.view);
  session.endDrag();
  assert(session.undo());
  assert.deepEqual(session.game.view, baseline);
  session.beginDrag(); session.drag('mining', maximum); session.endDrag();
  assert.deepEqual(session.game.view, endpoint);
});


test('capacity Mining APY forecasts future income and counts the pending payout once', () => {
  const { createGrowthCycle, calculateNewCohortMiningApy, MAX_USABLE_BITCOIN,
    MINIMUM_MINING_ARGONS_PER_BLOCK, BLOCKS_PER_COHORT } = require('../src/lib/exponentialTriggers');
  const initial = createGrowthCycle(mainnetBasics);
  const minimumRewards = MINIMUM_MINING_ARGONS_PER_BLOCK * BLOCKS_PER_COHORT;
  const state = { ...initial, bitcoinLocked: MAX_USABLE_BITCOIN,
    capacityMarketPressure: 1, expectedDaysToBitcoinCapacity: 0, rewardReductionActive: true,
    baseArgonRewards: minimumRewards,
    miningCohortBaseArgonRewards: Array(10).fill(minimumRewards),
    pendingMiningMint: 50_000 };
  const original = structuredClone(state);
  const latest = state.miningCohortSeats.length - 1;
  const bidPerSeat = state.miningAuctionCohortRevenues[latest] / state.miningCohortSeats[latest];
  const cost = bidPerSeat * state.argonPriceUsd + state.argonotsBidPerSeat * state.argonotPriceUsd;
  // Ten daily base payments sum to one ten-day reward; the pending payout is
  // received once. Previously earned issuance is outside this future period.
  const payout = (minimumRewards + state.pendingMiningMint) / state.seatCount * state.argonPriceUsd
    + (state.argonotsBidPerSeat + state.baseArgonotRewards / state.seatCount) * state.argonotPriceUsd;
  const expected = ((payout / cost) ** 36.5 - 1) * 100;
  const actual = calculateNewCohortMiningApy(state);
  assert(Math.abs(actual - expected) < Math.max(1e-8, Math.abs(expected) * 1e-12));
  assert.equal(calculateNewCohortMiningApy({ ...state, miningCohortMintedArgons: Array(10).fill(1e15) }), actual,
    'already earned rewards must not inflate the future quote');
  assert.deepEqual(state, original, 'forecasting must not settle or mutate the network');
});

test('Play reaches BTC capacity with a forecast Mining APY below the billion-percent display limit', () => {
  const { MAX_USABLE_BITCOIN, calculateNewCohortMiningApy } = require('../src/lib/exponentialTriggers');
  const session = new GameSession(mainnetBasics);
  let active = 'mining';
  for (let step = 0; step < 100 && session.game.bitcoin < MAX_USABLE_BITCOIN && !session.game.won; step++) {
    if (session.game.qualifies(active)) active = active === 'mining' ? 'vaulting' : 'mining';
    if (!session.advanceCompetition(active)) {
      active = active === 'mining' ? 'vaulting' : 'mining';
      if (!session.advanceCompetition(active)) break;
    }
    assert(session.game.view.days.every(day => day.miningApy > 40));
    assert.equal(session.game.apy('mining'), Math.min(calculateNewCohortMiningApy(session.game.view.frame.state), 1e12));
  }
  assert.equal(session.game.bitcoin, MAX_USABLE_BITCOIN);
  assert(session.game.apy('mining') > 40 && session.game.apy('mining') < 1e9);
  const endpoint = structuredClone(session.game.view);
  const last = session.actions.at(-1);
  assert(session.undo());
  assert(session.advanceCompetition(last.side));
  assert.deepEqual(session.game.view, endpoint, 'the capacity forecast survives undo and replay');
});

test('Mining slider endpoints stop at the first miner below the target across growth phases', () => {
  const game = new GrowthGame(mainnetBasics);
  let miningPhases = 0;
  for (let i = 0; i < 12 && game.bitcoin < 17_500_000 - 1e-6; i++) {
    const side = game.qualifies('mining') ? 'vaulting' : 'mining';
    const { minimum, maximum } = game.bounds(side);
    if (side === 'mining' && maximum > minimum) {
      game.setValue(side, maximum - 1);
      assert.equal(game.miners, maximum - 1);
      assert(game.apy('mining') >= GAME_TARGET, `phase ${i}: predecessor below target`);
      game.setValue(side, maximum);
      assert.equal(game.miners, maximum);
      assert(game.apy('mining') < GAME_TARGET && game.apy('mining') > 40, `phase ${i}: endpoint outside target range`);
      miningPhases++;
    } else game.setValue(side, maximum);
  }
  assert(miningPhases >= 4, 'cover both early growth and rollover phases');
});
