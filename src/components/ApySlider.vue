<template>
  <div class="apy-slider" :class="[side, { 'capital-grip': capitalGrip }]">
    <div class="scale" aria-hidden="true">
      <span v-for="tick in ticks" :key="tick.value" :style="{ bottom: `${position(tick.value)}%` }">
        {{ tick.label }}
      </span>
    </div>
    <SliderRoot :model-value="sliderValue" @update:model-value="changeValue" @pointerdown.capture="startPointer" @pointercancel="emit('cancel')" @keydown.capture="startKey" class="slider-root" orientation="vertical"
      :disabled="disabled" :min="0" :max="1" :step="0.001" thumb-alignment="overflow">
      <SliderTrack v-if="!capitalGrip" class="slider-track" />
      <SliderThumb as-child>
      <span class="slider-thumb" :aria-label="capitalGrip ? `${label.replace(' APY', '')} capital: drag up to add` : label" :aria-disabled="disabled"
        :aria-valuenow="currentApy" :aria-valuemin="minimumApy"
        :aria-valuemax="limitApy"
        :aria-valuetext="`${value[0].toLocaleString('en-US', { minimumFractionDigits: value[0] < 10 ? 2 : 0, maximumFractionDigits: 2 })} percent${reversed ? '; move up to add capital and lower APY' : ''}`"
        :title="`${capitalGrip ? 'Drag up to add capital; drag down to undo. ' : ''}${label}: ${value[0].toLocaleString('en-US', { minimumFractionDigits: value[0] < 10 ? 2 : 0, maximumFractionDigits: 2 })}% · Initial mainnet snapshot: ${snapshotAt}`" />
      </SliderThumb>
      <div ref="card" class="apy-card" :class="{ expanded: hasChanged, dragging: cardDragging }" :style="cardStyle"
        @pointerdown.stop.prevent="startCardDrag" @pointermove.stop="moveCardDrag"
        @pointerup.stop="releaseGesture" @pointercancel.stop="cancelCardDrag" @lostpointercapture.stop="releaseGesture">
        <div v-if="summaryLabel && summaryAmount !== undefined && summaryAmount > 0" class="bid-header">
          {{ summaryLabel }} {{ summaryAmount!.toLocaleString('en-US', { style: 'currency', currency: 'USD', notation: summaryAmount! >= 1000 ? 'compact' : 'standard', maximumFractionDigits: summaryAmount! >= 1000 ? 1 : 2 }) }}
        </div>
        <template v-if="hasChanged && !compactLabel">
          <span>{{ label }} {{ currentApy < referenceApy ? 'decreased' : 'increased' }}</span>
          <span>from <b>{{ referenceApy.toLocaleString('en-US', apyFormatOptions(referenceApy)) }}%</b> to</span>
        </template>
        <span v-else>{{ label }}</span>
        <div class="relative inline-flex items-center self-center">
          <strong>{{ value[0].toLocaleString('en-US', apyFormatOptions(value[0])) }}%</strong>
          <TooltipProvider v-if="warningMessage" :delay-duration="150">
            <TooltipRoot>
              <TooltipTrigger as-child>
                <button type="button" data-apy-warning :aria-label="`${label} return warning`"
                  class="absolute left-full ml-3 flex size-8 cursor-default items-center justify-center border-0 bg-transparent p-0 text-red-600"
                  @pointerdown.stop @pointermove.stop @pointerup.stop @click.stop @keydown.stop>
                  <svg viewBox="0 0 40 40" aria-hidden="true" class="size-8 shrink-0">
                    <path d="M12 1H28L39 12V28L28 39H12L1 28V12Z" fill="currentColor" />
                    <path d="M20 11V21" stroke="white" stroke-width="4" stroke-linecap="round" />
                    <circle cx="20" cy="29" r="2.5" fill="white" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipPortal>
                <TooltipContent side="top" :side-offset="10" :collision-padding="12"
                  class="z-50 max-w-[340px] rounded-md border border-solid border-[#c6bdcc] bg-[#fdfbfd] px-4 py-3 text-sm leading-relaxed text-[#34343e] shadow-lg">
                  {{ warningMessage }}
                  <TooltipArrow class="fill-[#fdfbfd]" />
                </TooltipContent>
              </TooltipPortal>
            </TooltipRoot>
          </TooltipProvider>
        </div>
      </div>
    </SliderRoot>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue';
import { SliderRoot, SliderThumb, SliderTrack, TooltipProvider, TooltipRoot, TooltipTrigger,
  TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
import { createLogApyScale } from '../lib/logApyScale';
import { RETURN_THRESHOLD_APY } from '../lib/exponentialTriggers';
const props = defineProps<{ capitalGrip?: boolean; warningMessage?: string; positionScale?: { toPosition: (apy: number) => number; toApy: (position: number) => number }; apyFloor?: number; compactLabel?: boolean; reversed?: boolean; label: string; side: 'left' | 'right'; scaleMaximum: number; disabled: boolean; snapshotAt: string; currentApy: number; referenceApy: number; limitApy: number; summaryLabel?: string; summaryAmount?: number }>();

const emit = defineEmits<{ begin: []; change: [apy: number]; cancel: []; release: [] }>();

const minimumApy = computed(() => props.apyFloor ?? RETURN_THRESHOLD_APY);
const maximum = computed(() => props.reversed ? Math.max(props.limitApy, props.currentApy) : props.scaleMaximum);
const value = computed(() => [props.currentApy]);
const trackHeight = ref(550);
const scale = computed(() => createLogApyScale(minimumApy.value, maximum.value, trackHeight.value));
const toPosition = (apy: number) => props.positionScale?.toPosition(apy)
  ?? (props.reversed ? 1 - scale.value.toPosition(apy) : scale.value.toPosition(apy));
const sliderValue = computed(() => [toPosition(props.currentApy)]);
const hasChanged = computed(() => Math.abs(props.currentApy - props.referenceApy) > 1e-8);
const ticks = computed(() => scale.value.ticks.map(apy => ({
  value: apy,
  label: `${apy.toLocaleString('en-US', { notation: apy >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 2 })}%`,
})));
const position = (apy: number) => toPosition(apy) * 100;

function apyFormatOptions(apy: number): Intl.NumberFormatOptions {
  const unit = apy >= 1000 ? 1000 ** Math.min(4, Math.floor(Math.log10(apy) / 3)) : 1;
  const underTen = apy / unit < 10;
  return {
    notation: apy >= 1000 ? 'compact' : 'standard',
    minimumFractionDigits: underTen ? 2 : 0,
    maximumFractionDigits: underTen || apy < 1000 ? 2 : 1,
  };
}

function changeValue(values: number[] | undefined) {
  if (props.disabled || !values?.length) return;
  const apy = props.positionScale && values[0] <= 0 ? props.limitApy : props.positionScale?.toApy(values[0])
    ?? scale.value.toApy(props.reversed ? 1 - values[0] : values[0]);
  emit('change', Math.max(minimumApy.value, Math.min(apy, props.limitApy)));
}

let gestureActive = false;
const cardDragging = ref(false);
let cardDrag: { pointerId: number; y: number; position: number; height: number } | undefined;
const adjustmentKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
function startPointer(event?: PointerEvent) {
  if (event && card.value?.contains(event.target as Node)) return;
  if (props.capitalGrip && event && !(event.target as HTMLElement).closest('.slider-thumb')) return;
  if (props.disabled) return;
  gestureActive = true;
  emit('begin');
}
function releaseGesture(event?: Event) {
  if (event instanceof KeyboardEvent && !adjustmentKeys.includes(event.key)) return;
  if (event instanceof PointerEvent && cardDrag && event.pointerId !== cardDrag.pointerId) return;
  const pointerId = cardDrag?.pointerId;
  cardDrag = undefined;
  cardDragging.value = false;
  if (pointerId !== undefined && card.value?.hasPointerCapture(pointerId)) card.value.releasePointerCapture(pointerId);
  if (!gestureActive) return;
  gestureActive = false;
  emit('release');
}
function startKey(event: KeyboardEvent) {
  if (props.disabled || (event.target as HTMLElement).closest('[data-apy-warning]')) return;
  if (event.key === 'Escape') emit('cancel');
  else if (adjustmentKeys.includes(event.key)) startPointer();
}

const card = ref<HTMLElement | null>(null);
function startCardDrag(event: PointerEvent) {
  if (props.capitalGrip || props.disabled || !event.isPrimary || event.button !== 0 || cardDrag) return;
  const panel = card.value;
  const height = panel?.parentElement?.getBoundingClientRect().height;
  if (!panel || !height) return;
  cardDrag = { pointerId: event.pointerId, y: event.clientY, position: sliderValue.value[0], height };
  cardDragging.value = true;
  panel.setPointerCapture(event.pointerId);
  startPointer();
}
function moveCardDrag(event: PointerEvent) {
  if (!cardDrag || event.pointerId !== cardDrag.pointerId) return;
  const next = cardDrag.position + (cardDrag.y - event.clientY) / cardDrag.height;
  changeValue([Math.max(0, Math.min(1, next))]);
}
function cancelCardDrag(event: PointerEvent) {
  if (!cardDrag || event.pointerId !== cardDrag.pointerId) return;
  releaseGesture(event);
  emit('cancel');
}
const cardStyle = ref({ top: '0px', '--arrow-top': '50%' });
let observer: ResizeObserver | undefined;

function positionCard() {
  const panel = card.value;
  const root = panel?.parentElement;
  if (!panel || !root) return;
  const bounds = root.getBoundingClientRect();
  trackHeight.value = root.parentElement?.clientHeight ?? bounds.height;
  const nibY = bounds.top + bounds.height * (1 - position(value.value[0]) / 100);
  const height = panel.offsetHeight;
  const headerHeight = panel.querySelector<HTMLElement>('.bid-header')?.offsetHeight ?? 0;
  const top = Math.max(12 + headerHeight, Math.min(nibY - height / 2, window.innerHeight - 12 - height));
  cardStyle.value = {
    top: `${top - bounds.top}px`,
    '--arrow-top': `${Math.max(15, Math.min(height - 15, nibY - top)) - 1}px`,
  };
}

watch([value, maximum], positionCard, { flush: 'post' });
onMounted(() => {
  window.addEventListener('pointerup', releaseGesture);
  window.addEventListener('pointercancel', releaseGesture);
  window.addEventListener('keyup', releaseGesture);
  window.addEventListener('blur', releaseGesture);
  observer = new ResizeObserver(positionCard);
  if (card.value) {
    observer.observe(card.value);
    observer.observe(card.value.parentElement!);
  }
  window.addEventListener('resize', positionCard);
  window.addEventListener('scroll', positionCard, true);
  positionCard();
});
onScopeDispose(() => {
  releaseGesture();
  window.removeEventListener('pointerup', releaseGesture);
  window.removeEventListener('pointercancel', releaseGesture);
  window.removeEventListener('keyup', releaseGesture);
  window.removeEventListener('blur', releaseGesture);
  observer?.disconnect();
  window.removeEventListener('resize', positionCard);
  window.removeEventListener('scroll', positionCard, true);
});
</script>

<style scoped>
.apy-slider {
  position: absolute;
  z-index: 1;
  top: 58px;
  bottom: 32px;
  width: 48px;
}
.apy-slider.left { left: calc(7.5% - 24px); }
.apy-slider.right { right: calc(7.5% - 24px); }
.scale span {
  position: absolute;
  right: calc(100% - 6px);
  transform: translateY(50%);
  color: #999da5;
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
}
.right .scale span { right: auto; left: calc(100% - 6px); }
.scale span::after {
  content: '';
  position: absolute;
  top: 50%;
  right: -12px;
  width: 7px;
  height: 1px;
  background: currentColor;
}
.right .scale span::after { right: auto; left: -12px; }
.scale span:first-child { transform: none; }
.scale span:last-child { transform: translateY(100%); }
.slider-root {
  position: relative;
  /* Inset travel by a quarter of the 28px nib; keep the visible track full length. */
  top: 7px;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(100% - 14px);
  touch-action: none;
  user-select: none;
  cursor: pointer;
}
.slider-track {
  position: relative;
  flex-grow: 1;
  margin-block: -7px;
  width: 6px;
  border: 1px solid #aa9aae;
  border-radius: 999px;
  background: #d0bed7;
  box-shadow: inset 1px 0 1px #00000020;
}
.slider-thumb {
  display: block;
  width: 28px;
  height: 28px;
  border: 1px solid #b9b9bd;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 2px #00000026;
  cursor: grab;
}
.slider-root[data-disabled], .slider-root[data-disabled] .slider-thumb,
.slider-root[data-disabled] .apy-card { cursor: not-allowed; }
.slider-thumb:hover { border-color: #907299; }
.slider-thumb:active { cursor: grabbing; }
.slider-thumb:focus { outline: none; border-color: #66506e; }
.apy-card {
  position: absolute;
  left: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 288px;
  padding: 22px 16px;
  border: 1px solid #b9b9bd;
  border-radius: 4px;
  background: white;
  box-shadow: 0 2px 7px #00000026;
  color: #808080;
  cursor: grab;
  touch-action: none;
}
.apy-card.dragging { cursor: grabbing; }
.right .apy-card { left: auto; right: 46px; }
.apy-card.expanded { padding-block: 12px; }
.apy-card::before {
  content: '';
  position: absolute;
  top: var(--arrow-top);
  left: -11px;
  width: 20px;
  height: 20px;
  transform: translateY(-50%) rotate(45deg);
  border-left: 1px solid #b9b9bd;
  border-bottom: 1px solid #b9b9bd;
  background: white;
}
.right .apy-card::before { left: auto; right: -11px; transform: translateY(-50%) rotate(225deg); }
.apy-card span { font-size: 14px; line-height: 20px; text-transform: uppercase; }
.apy-card strong { font-size: 44px; line-height: 1.2; font-weight: 700; font-variant-numeric: tabular-nums; }
.bid-header {
  position: absolute;
  bottom: 100%;
  left: -1px;
  right: -1px;
  padding: 7px 8px;
  border: 1px solid #666;
  border-radius: 4px;
  background: #808080;
  box-shadow: 0 2px 5px #00000026;
  color: white;
  font-size: 16px;
  line-height: 20px;
  font-weight: 700;
  text-align: center;
}
/* The existing accessible slider now controls the edge of the added-capital fill. */
.capital-grip .slider-root { pointer-events: none; cursor: default; }
.capital-grip .slider-thumb {
  position: relative;
  width: var(--capital-width);
  height: 24px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  pointer-events: auto;
  cursor: ns-resize;
  touch-action: none;
}
.capital-grip .slider-thumb::before {
  content: '';
  position: absolute;
  inset: 10px 0;
  background: #8720b5;
  border-radius: 2px;
}
.capital-grip .slider-thumb::after {
  content: '';
  position: absolute;
  width: 42px;
  height: 12px;
  top: 6px;
  left: calc(50% - 21px);
  border: 1px solid #8720b5;
  border-radius: 6px;
  background: #fdfbfd;
  box-shadow: inset 0 4px #fdfbfd, inset 0 5px #8720b5, inset 0 -4px #fdfbfd, inset 0 -5px #8720b5;
}
.capital-grip .slider-thumb:focus-visible { outline: 2px solid #8720b5; outline-offset: 2px; }
.capital-grip .slider-root[data-disabled] .slider-thumb { pointer-events: none; opacity: .4; }
.capital-grip .apy-card { pointer-events: auto; cursor: default; touch-action: auto; }
</style>
