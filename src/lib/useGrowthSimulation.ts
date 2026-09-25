import { inject, provide, shallowRef, type InjectionKey } from 'vue';
import { GrowthSimulation, minimumApyFor, type GrowthSide } from './GrowthSimulation';
import { mainnetBasics } from './mainnet';
import { createLogApyScale } from './logApyScale';

function createController() {
  const simulation = new GrowthSimulation(mainnetBasics);
  const view = shallowRef(simulation.view);
  const limits = shallowRef({ mining: simulation.limit('mining'), vaulting: simulation.limit('vaulting') });
  const scales = shallowRef(simulation.scales);
  const enabled = shallowRef({ mining: true, vaulting: true });
  const interacting = shallowRef(false);
  const dragDirection = shallowRef(0);
  const circuitRotation = shallowRef(0);
  let rotationAtBegin = 0;
  function sync() {
    view.value = simulation.view;
    limits.value = { mining: simulation.limit('mining'), vaulting: simulation.limit('vaulting') };
    scales.value = simulation.scales;
    enabled.value = { mining: simulation.canBegin('mining'), vaulting: simulation.canBegin('vaulting') };
  }
  function begin(side: GrowthSide) {
    dragDirection.value = 0;
    rotationAtBegin = circuitRotation.value;
    interacting.value = simulation.begin(side);
    sync();
  }
  function preview(side: GrowthSide, target: number) {
    const before = side === 'mining' ? view.value.frame.miningApy : view.value.frame.vaultingApy;
    const scale = createLogApyScale(minimumApyFor(side), scales.value[side]);
    simulation.preview(side, target);
    const after = side === 'mining' ? simulation.view.frame.miningApy : simulation.view.frame.vaultingApy;
    if (after !== before) {
      dragDirection.value = after < before ? 1 : -1;
      // Half a turn per full track of actual logarithmic slider travel.
      circuitRotation.value += (scale.toPosition(before) - scale.toPosition(after)) * 180;
    }
    sync();
  }
  function release() {
    interacting.value = false;
    dragDirection.value = 0;
  }
  function cancel() {
    release();
    simulation.cancel();
    circuitRotation.value = rotationAtBegin;
    sync();
  }
  return { view, limits, scales, enabled, interacting, dragDirection, circuitRotation, begin, preview, release, cancel };
}
const key: InjectionKey<ReturnType<typeof createController>> = Symbol('growth-simulation');

export function provideGrowthSimulation() {
  const controller = createController();
  provide(key, controller);
  return controller;
}

export function useGrowthSimulation() {
  const controller = inject(key);
  if (!controller) throw new Error('Growth simulation must be provided by App');
  return controller;
}
