<template>
  <div class="app-shell">
    <Header :circulation="circulation" :current-circulation="currentCirculation" :locked-bitcoins="state.bitcoinLocked" :days="days" :snapshot-at="mainnetUpdatedAt"
      :issuance="settledView.issuance" :initial-portfolio="settledView.frame.operatorAccount.initialCapital" :current-portfolio="settledView.frame.operatorValue"
      :mining-income="settledView.frame.operatorAccount.miningIncome" :vault-income="settledView.frame.operatorAccount.vaultIncome" :can-undo="canUndo"
      :running="autoPlaying" :play-disabled="dragActive || (busy && !autoPlaying) || Boolean(playbackAlert)" :playback-status="playbackStatus" :playback-alert="playbackAlert"
      @customize="openPortfolioEditor" @play="togglePlayback" @reset="reset" @help="showHelp = true" @undo="undo" />
    <main class="learning-workspace">
      <LearningGuide :style="{ visibility: busy ? 'hidden' : 'visible' }" :mining-done="miningDone" :completed="completed" :exploring="exploring" @vaulting="active = 'vaulting'" @explore="skipGuide" @restart="reset" />
      <EcosystemDiagram @activate="!busy && (active = $event)" :focused="restoredFlow?.active ?? active" :active="restoredFlow ? (restoredFlow.feedback?.side ?? restoredFlow.active) : (feedback?.side ?? active)" :preparing="dragActive && !restoredFlow" :stage="restoredFlow?.stage ?? (dragActive ? 1 : stage)" :busy="(busy && !autoPlaying) || (dragActive && !restoredFlow)" :before="beforeValues" :after="afterValues"
        :guided="guided" :guide-stage="guideStage" :guide-catching-up="dragActive || guideCatchingUp" :start-here="startHere && !showWelcome && !showHelp" :start-vaulting="startVaulting && !showWelcome && !showHelp" @prev="previousGuidedStep" @next="nextGuidedStep" :miners="miners" :bitcoin="bitcoin" :mining-transfer="transferFor('mining')" :vaulting-transfer="transferFor('vaulting')">
        <template v-for="side in sides" :key="side" #[`${side}-control`]>
            <button v-if="!autoPlaying && !dragActive && canUndo && actions[actions.length - 1]?.side === side" class="node-undo" :aria-label="`Undo last ${side} adjustment`" :title="`Undo last ${side} adjustment`"
              @click="undo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h9a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5" /></svg>
            </button>
            <CompetitionSlider v-if="!autoPlaying" :label="side === 'mining' ? 'Miners' : 'BTC in vaults'" :value="side === 'mining' ? miners : bitcoin"
              :minimum="bounds[side].minimum" :maximum="bounds[side].maximum"
              :settlements="bounds[side].settlements"
              :disabled="busy && !(guided && active === 'mining' && side === 'mining')"
              @begin="beginDrag(side)" @change="change(side, $event)" @end="endDrag" />
        </template>
        <template #details>
          <div v-for="side in sides" :key="side"><h3>{{ side === 'mining' ? 'Mining' : 'Vaulting' }} calculations</h3>
            <OperationPanel :side="side" :state="state" :apy="side === 'mining' ? settledView.frame.miningApy : settledView.frame.vaultingApy"
              :miners="miners" :capital="side === 'mining' ? miningCapital : vaultingCapital"
              :payout="side === 'mining' ? miningPayout : settledView.vaultingPayout"
              :earnings="side === 'mining' ? miningRewards : settledView.vaultingPayout - vaultingCapital" />
          </div>
        </template>
      </EcosystemDiagram>
      <div v-if="capacityLimited || competitionLimited" class="capacity-notice">
        <p role="status">{{ capacityLimited ? 'BTC competition has reached the scenario’s 17.5M BTC capacity.' : 'Additional competition is unavailable in this phase.' }} Advance a day to follow reward and bid adjustments, or Undo to explore another path.</p>
        <button class="primary-button" :disabled="busy || dragActive || advanceStopped" @click="advanceDay">Advance one day</button>
        <p v-if="advanceStopped" role="status">The model has no further economic changes for this side. Switch sides, undo, or restart.</p>
      </div>
      <p class="scenario-note">A learning simulation using a saved network snapshot. The mining slider selects whole miners; changes settle over the required days. The diagram, circulation, and portfolio share those settlements. APY annualizes a ten-day return.</p>
    </main>
    <GameOverlay v-if="showWelcome" @close="showWelcome = false" title="Welcome to The Exponential Growth Engine">
      <p>Mining and vaulting grow together. Discover how adding competition on one side changes the returns on the other.</p>
      <p><strong>Add miners</strong> to see how their bids support vault revenue. Then <strong>add BTC</strong> to see how vault capital funds mining rewards.</p>
      <p>Move a slider to add miners or BTC. The mining slider selects whole miners, and adjustments settle over the required days. The left end is the phase’s starting amount; the right end reaches the adjustment toward 53.99% APY or the available competition limit. Follow the highlighted path as each change moves through the ecosystem.</p>
      <p>Your simulated ₳{{ startingPortfolio.toLocaleString('en-US') }} portfolio shows the personal effect. You can undo any adjustment and explore at your own pace.</p>
      <template #actions><button class="primary-button" @click="showWelcome = false">Start with mining →</button></template>
    </GameOverlay>
    <GameOverlay v-if="showPortfolioEditor" @close="showPortfolioEditor = false" title="Customize your starting investment">
      <p>Choose your starting portfolio, split equally between mining and vaulting. Applying a new amount restarts your simulation and clears its progress.</p>
      <form id="starting-portfolio-form" class="portfolio-editor" @submit.prevent="applyPortfolio">
        <label for="starting-portfolio-input">Starting portfolio (₳)</label>
        <input id="starting-portfolio-input" v-model="formattedPortfolioDraft" type="text" inputmode="numeric" required @blur="roundPortfolioDraft" />
        <input v-model.number="portfolioDraft" type="range" min="1000" max="100000" step="100" aria-label="Starting portfolio amount" />
        <div class="portfolio-range-labels"><span>₳1,000</span><span>₳100,000</span></div>
      </form>
      <template #actions>
        <button class="portfolio-cancel" @click="showPortfolioEditor = false">Cancel</button>
        <button class="primary-button" type="submit" form="starting-portfolio-form" :disabled="!validPortfolioDraft">Apply and restart</button>
      </template>
    </GameOverlay>
    <GameOverlay v-if="showHelp" @close="showHelp = false" title="Follow the connection, then explore.">
      <p>Add miners to see how their bids support vault revenue. Then add BTC to see how vault capital funds mining rewards in this scenario.</p>
      <p>Your simulated ₳{{ startingPortfolio.toLocaleString('en-US') }} portfolio tracks the personal effect as network days advance. Clicking a panel only changes your focus. Use Undo to reverse a slider adjustment.</p>
      <p>Completing the two directions finishes the lesson. The 53.99% APY benchmark limits adjustments within each phase; it is not a winning condition. The model can reach its BTC capacity before both sides reach that benchmark.</p>
      <template #actions><button class="primary-button" @click="showHelp = false">Back to exploring</button></template>
    </GameOverlay>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, shallowRef, onUnmounted, watch } from 'vue';
import Header from './components/Header.vue';
import OperationPanel from './components/OperationPanel.vue';
import CompetitionSlider from './components/CompetitionSlider.vue';
import LearningGuide from './components/LearningGuide.vue';
import EcosystemDiagram from './components/EcosystemDiagram.vue';
import GameOverlay from './components/GameOverlay.vue';
import { GameSession } from './lib/gameSession';
import { vaultCollateral } from './lib/growthGame';
import { mainnetBasics, mainnetUpdatedAt } from './lib/mainnet';
import { MAX_USABLE_BITCOIN, type GrowthSide } from './lib/exponentialTriggers';
const startingPortfolio = ref(10_000), portfolioDraft = ref<number | string>(10_000), showPortfolioEditor = ref(false);
const formattedPortfolioDraft = computed({
  get: () => typeof portfolioDraft.value === 'number' ? portfolioDraft.value.toLocaleString('en-US') : portfolioDraft.value,
  set: (value: string) => {
    const digits = value.replace(/,/g, '').trim();
    portfolioDraft.value = /^\d+$/.test(digits) ? Number(digits) : value;
  },
});
const validPortfolioDraft = computed(() => typeof portfolioDraft.value === 'number' && Number.isInteger(portfolioDraft.value) && portfolioDraft.value >= 1_000 && portfolioDraft.value <= 100_000);
function roundPortfolioDraft() {
  if (validPortfolioDraft.value) portfolioDraft.value = Math.round(Number(portfolioDraft.value) / 100) * 100;
}
function openPortfolioEditor() {
  if (dragActive.value) return;
  if (autoPlaying.value) { stopPlayback(); playbackStatus.value = 'Simulation paused.'; }
  portfolioDraft.value = startingPortfolio.value;
  showPortfolioEditor.value = true;
}
function applyPortfolio() {
  if (!validPortfolioDraft.value) return;
  roundPortfolioDraft();
  startingPortfolio.value = Number(portfolioDraft.value);
  reset();
  showPortfolioEditor.value = false;
}
let session = new GameSession(mainnetBasics, startingPortfolio.value);
const initialMiners = session.game.miners, initialBitcoin = session.game.bitcoin;
const sides: GrowthSide[] = ['mining', 'vaulting'];
const active = ref<GrowthSide>('mining'), exploring = ref(false), showHelp = ref(false), showWelcome = ref(true);
const view = shallowRef(session.game.view), miners = ref(session.game.miners), bitcoin = ref(session.game.bitcoin);
const settledView = shallowRef(view.value);
const settledMiners = ref(miners.value);
const dragActive = ref(false);
const stage = ref(0), busy = ref(false), flowCapital = ref(0);
const guided = ref(false), startHere = ref(true), startVaulting = ref(false);
const guideStage = ref(0), guideCatchingUp = ref(false);
const guidedDone = ref({ mining: false, vaulting: false });
const guidedStages = computed(() => active.value === 'mining' ? [2, 2.5, 3, 4, 5, 6] : [2, 2.5, 3, 4, 5, 6]);
function previousGuidedStep() {
  if (dragActive.value || guideCatchingUp.value) return;
  const previous = guidedStages.value[guidedStages.value.indexOf(guideStage.value) - 1];
  if (previous !== undefined) stage.value = guideStage.value = previous;
}
function finishSequence() {
  settledView.value = view.value; settledMiners.value = miners.value;
  if (feedback.value) previousTransfers.value[feedback.value.side] = feedback.value.amount;
  busy.value = false;
}
function nextGuidedStep() {
  if (dragActive.value || guideCatchingUp.value) return;
  if (startHere.value && !guided.value) { startHere.value = false; return; }
  const stages = guidedStages.value;
  const next = stages[stages.indexOf(guideStage.value) + 1];
  if (next !== undefined) stage.value = guideStage.value = next;
  else { guidedDone.value[active.value] = true; guided.value = false; finishSequence(); if (active.value === 'mining') { startVaulting.value = true; } }
}
function skipGuide() {
  exploring.value = true; startHere.value = false; startVaulting.value = false;
  if (guided.value) { timers.forEach(clearTimeout); timers = []; guideCatchingUp.value = false; guided.value = false; finishSequence(); }
}
let timers: ReturnType<typeof setTimeout>[] = [];
const autoPlaying = ref(false), playbackStatus = ref('');
const terminalPlaybackMessage = ref('');
let playbackTimer: ReturnType<typeof setTimeout> | undefined;
function stopPlayback() {
  clearTimeout(playbackTimer); playbackTimer = undefined; autoPlaying.value = false; busy.value = false;
}
function togglePlayback() {
  if (autoPlaying.value) { stopPlayback(); playbackStatus.value = 'Simulation paused.'; return; }
  if (busy.value || dragActive.value || playbackAlert.value) return;
  cancelSequence(); showWelcome.value = false; showHelp.value = false;
  exploring.value = true; startHere.value = false; startVaulting.value = false; feedback.value = null;
  previousTransfers.value = { mining: 0, vaulting: 0 };
  autoPlaying.value = true; busy.value = true; playbackStatus.value = '';
  const playbackStartDay = session.game.view.network.elapsedDays;
  const tick = () => {
    if (!autoPlaying.value) return;
    if (session.game.won || capacityLimited.value || session.game.view.network.elapsedDays - playbackStartDay >= 3650) {
      playbackStatus.value = capacityLimited.value ? 'Simulation reached BTC capacity.' : session.game.won ? 'Simulation complete.' : 'Simulation reached the ten-year playback limit.';
      terminalPlaybackMessage.value = playbackStatus.value;
      stopPlayback(); return;
    }
    let side = active.value;
    if (session.game.qualifies(side)) side = side === 'mining' ? 'vaulting' : 'mining';
    if (!session.advanceCompetition(side)) {
      side = side === 'mining' ? 'vaulting' : 'mining';
      if (!session.advanceCompetition(side)) { playbackStatus.value = 'No further safe economic changes are available (40% Mining APY minimum).'; terminalPlaybackMessage.value = playbackStatus.value; stopPlayback(); return; }
    }
    active.value = side; sync();
    settledView.value = view.value; settledMiners.value = miners.value;
    actionBaseline.value = diagramValues(view.value, miners.value);
    playbackTimer = setTimeout(tick, 120);
  };
  playbackTimer = setTimeout(tick, 0);
}
function cancelSequence() { stopPlayback(); playbackStatus.value = ''; terminalPlaybackMessage.value = ''; timers.forEach(clearTimeout); timers = []; busy.value = false; guided.value = false; guideCatchingUp.value = false; guideStage.value = 0; stage.value = 0; }
onUnmounted(cancelSequence);
const actions = shallowRef([...session.actions]), canUndo = ref(false), sequence = ref(0);
type Feedback = { side: GrowthSide; amount: number; inputChange: number; beforeApy: number; afterApy: number };
const feedback = shallowRef<Feedback | null>(null);
const previousTransfers = ref({ mining: 0, vaulting: 0 });
function transferFor(side: GrowthSide) { return feedback.value?.side === side && stage.value >= 4 ? feedback.value.amount : previousTransfers.value[side]; }
function diagramValues(v: typeof view.value, count: number) {
  const s = v.frame.state;
  const collateral = s.argonotsBidPerSeat * count * s.argonotPriceUsd / s.argonPriceUsd;
  return { miners: count, bitcoin: s.bitcoinLocked, miningCapital: s.miningAuctionRevenue + collateral, stakes: collateral,
    miningPayout: s.baseArgonRewards + s.pendingMiningMint + s.baseArgonotRewards * s.argonotPriceUsd / s.argonPriceUsd + collateral,
    vaultingPayout: v.vaultingPayout, securitization: vaultCollateral(s).total, argonSecuritization: vaultCollateral(s).argons, argonotSecuritization: vaultCollateral(s).argonots, bonds: s.bondCapital,
    miningApy: v.frame.miningApy, vaultingApy: v.frame.vaultingApy };
}
const actionBaseline = shallowRef(diagramValues(settledView.value, settledMiners.value));
const dragFlow = shallowRef<{ active: GrowthSide; guided: boolean; guideStage: number; busy: boolean; stage: number; feedback: Feedback | null; baseline: ReturnType<typeof diagramValues> } | null>(null);
const restoredFlow = computed(() => dragActive.value && !feedback.value ? dragFlow.value : null);
const beforeValues = computed(() => restoredFlow.value?.stage ? restoredFlow.value.baseline : dragActive.value || stage.value > 0 ? actionBaseline.value : diagramValues(settledView.value, settledMiners.value));
const afterValues = computed(() => diagramValues(view.value, miners.value));
const miningDone = computed(() => actions.value.some(action => action.side === 'mining' && action.value > initialMiners));
const completed = computed(() => miningDone.value && actions.value.some(action => action.side === 'vaulting' && action.value > initialBitcoin));
const state = computed(() => settledView.value.frame.state);
const bounds = computed(() => { void view.value; return { mining: session.game.bounds('mining'), vaulting: session.game.bounds('vaulting') }; });
const circulation = session.game.view.network.argonCirculation;
const currentCirculation = computed(() => settledView.value.network.argonCirculation);
const days = computed(() => settledView.value.network.elapsedDays.toLocaleString('en-US', { maximumFractionDigits: 1 }));
const miningCollateral = computed(() => state.value.argonotsBidPerSeat * miners.value * state.value.argonotPriceUsd / state.value.argonPriceUsd);
const miningCapital = computed(() => state.value.miningAuctionRevenue + miningCollateral.value);
const miningRewards = computed(() => state.value.baseArgonRewards + state.value.pendingMiningMint + state.value.baseArgonotRewards * state.value.argonotPriceUsd / state.value.argonPriceUsd);
const miningPayout = computed(() => miningRewards.value + miningCollateral.value);
const vaultingCapital = computed(() => vaultCollateral(state.value).total);
const capacityLimited = computed(() => bitcoin.value >= MAX_USABLE_BITCOIN - 1e-6);
const playbackAlert = computed(() => capacityLimited.value ? 'This Simulation Has Reached Max BTC Capacity' : terminalPlaybackMessage.value);
const competitionLimited = computed(() => bounds.value[active.value].maximum <= bounds.value[active.value].minimum);
const advanceStopped = ref(false);
watch(active, () => { advanceStopped.value = false; });
watch(view, () => { advanceStopped.value = false; });
function advanceDay() {
  if (!session.advanceDay(active.value)) { advanceStopped.value = true; return; }
  advanceStopped.value = false;
  startHere.value = false; startVaulting.value = false;
  cancelSequence(); sync();
  settledView.value = view.value; settledMiners.value = miners.value;
  actionBaseline.value = diagramValues(view.value, miners.value);
  feedback.value = null; previousTransfers.value = { mining: 0, vaulting: 0 };
}
const snapshot = () => ({ view: session.game.view, miners: session.game.miners, bitcoin: session.game.bitcoin });
let gesture: ReturnType<typeof snapshot> | undefined;
let cycleBaseline: ReturnType<typeof snapshot> | undefined;
function sync() { view.value = session.game.view; miners.value = session.game.miners; bitcoin.value = session.game.bitcoin; actions.value = [...session.actions]; canUndo.value = session.canUndo; }
function describe(side: GrowthSide, before: ReturnType<typeof snapshot>) {
  const inputChange = side === 'mining' ? miners.value - before.miners : bitcoin.value - before.bitcoin;
  if (Math.abs(inputChange) < 1e-10) { feedback.value = null; return; }
  feedback.value = { side, inputChange,
    amount: side === 'mining' ? (view.value.transfer?.revenue ?? 0) / view.value.frame.state.argonPriceUsd : view.value.issuance.mining - before.view.issuance.mining,
    beforeApy: side === 'mining' ? before.view.frame.vaultingApy : before.view.frame.miningApy,
    afterApy: side === 'mining' ? view.value.frame.vaultingApy : view.value.frame.miningApy };
}
function playSequence(resumeGuideAt?: number) {
  if (!feedback.value) { settledView.value = view.value; return; }
  cancelSequence(); busy.value = true; stage.value = 1;
  const s = view.value.frame.state;
  flowCapital.value = feedback.value.side === 'mining' ? s.miningAuctionRevenue + s.argonotsBidPerSeat * miners.value * s.argonotPriceUsd / s.argonPriceUsd : vaultCollateral(s).total;
  if (!exploring.value && !guidedDone.value[feedback.value.side]) {
    guided.value = true; guideStage.value = resumeGuideAt ?? guidedStages.value[0]!;
    if (resumeGuideAt === undefined) { stage.value = guideStage.value; return; }
    guideCatchingUp.value = true;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
    const catchUpStages = guidedStages.value.filter(n => n <= resumeGuideAt);
    catchUpStages.forEach((n, index) => timers.push(setTimeout(() => {
      stage.value = n;
      if (n === resumeGuideAt) guideCatchingUp.value = false;
    }, delay * (index + 1))));
    return;
  }
  const step = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
  const steps = 6;
  const payoutPause = feedback.value.side === 'mining';
  timers.push(setTimeout(() => { stage.value = 2.5; }, step * 2));
  if (payoutPause) timers.push(setTimeout(() => { stage.value = 3.5; }, step * 4));
  for (let n = 2; n <= steps; n++) timers.push(setTimeout(() => { stage.value = n; }, step * (n - 1 + (n >= 3 ? 1 : 0) + (payoutPause && n >= 4 ? 1 : 0))));
  timers.push(setTimeout(finishSequence, step * (steps + (payoutPause ? 2 : 1))));
}
function beginDrag(side: GrowthSide) { startHere.value = false; startVaulting.value = false; dragFlow.value = { active: active.value, guided: guided.value, guideStage: guideStage.value, busy: busy.value, stage: stage.value, feedback: feedback.value, baseline: actionBaseline.value }; dragActive.value = true; active.value = side; cancelSequence(); if (dragFlow.value.guided && side === 'mining') { guided.value = true; guideStage.value = dragFlow.value.guideStage; } feedback.value = null; gesture = snapshot(); session.beginDrag(); cycleBaseline = session.game.cycleBaseline(side); actionBaseline.value = diagramValues(cycleBaseline.view, cycleBaseline.miners); sequence.value++; }
function change(side: GrowthSide, value: number) { const before = cycleBaseline ?? session.game.cycleBaseline(side); if (!session.drag(side, value)) return; active.value = side; sync(); describe(side, before); }
function endDrag() {
  dragActive.value = false; session.endDrag(); sync();
  const changed = gesture && (miners.value !== gesture.miners || Math.abs(bitcoin.value - gesture.bitcoin) >= 1e-10);
  if (changed && feedback.value) playSequence(dragFlow.value?.guided && active.value === 'mining' ? dragFlow.value.guideStage : undefined);
  else if (changed) {
    settledView.value = view.value; settledMiners.value = miners.value;
    previousTransfers.value[active.value] = 0;
    if (guided.value) { stage.value = guideStage.value; busy.value = true; }
  }
  else if (dragFlow.value) {
    active.value = dragFlow.value.active; stage.value = dragFlow.value.stage;
    guided.value = dragFlow.value.guided; guideStage.value = dragFlow.value.guideStage; busy.value = dragFlow.value.busy;
    if (guided.value) stage.value = guideStage.value;
    feedback.value = dragFlow.value.feedback; actionBaseline.value = dragFlow.value.baseline;
  }
  gesture = undefined; cycleBaseline = undefined; dragFlow.value = null;
}
function undo() { startVaulting.value = false; dragActive.value = false; previousTransfers.value = { mining: 0, vaulting: 0 }; cancelSequence(); if (!session.undo()) return; gesture = undefined; sync(); settledView.value = view.value; settledMiners.value = miners.value; feedback.value = null; if (!exploring.value) active.value = miningDone.value ? 'vaulting' : 'mining'; }
function reset() { startHere.value = true; startVaulting.value = false; guidedDone.value = { mining: false, vaulting: false }; dragActive.value = false; previousTransfers.value = { mining: 0, vaulting: 0 }; cancelSequence(); session = new GameSession(mainnetBasics, startingPortfolio.value); gesture = undefined; active.value = 'mining'; exploring.value = false; feedback.value = null; sync(); settledView.value = view.value; settledMiners.value = miners.value; }
</script>
