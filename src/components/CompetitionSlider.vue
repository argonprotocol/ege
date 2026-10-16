<template>
  <div class="competition-slider" @click.stop>
    <SliderRoot class="competition-slider-root" :model-value="[adjusting ? draftPosition : position]" :min="0" :max="100" :step="0.1"
      :disabled="disabled || maximum <= minimum" @update:model-value="update"
      @pointerdown.capture="startPointer" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish"
      @keydown.capture="startKey" @keyup="finish" @focusout="finish">
      <SliderTrack class="competition-slider-track"><SliderRange class="competition-slider-range" /></SliderTrack>
      <SliderThumb class="competition-slider-thumb" :aria-label="label" :aria-valuetext="`${exact(value)} ${label}; ${position.toFixed(1)}% of this phase's range`" />
    </SliderRoot>
    <div class="competition-slider-limits"><span :title="exact(minimum)">{{ compact(minimum) }}</span><span :title="exact(maximum)">{{ compact(maximum) }}</span></div>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'reka-ui';
const props = defineProps<{ label: string; value: number; minimum: number; maximum: number; disabled: boolean; settlements?: number[] }>();
const emit = defineEmits<{ begin: []; change: [value: number]; end: [] }>();
const adjusting = ref(false);
const draftPosition = ref(0);
let range = { minimum: 0, maximum: 0 };
const endpoints = computed(() => adjusting.value ? range : props);
// Preserve fine control at the start even when the target spans many orders of magnitude.
const position = computed(() => {
 const { minimum, maximum } = endpoints.value;
 if(maximum <= minimum) return 0;
 return Math.max(0, Math.min(100, (Math.log1p(props.value)-Math.log1p(minimum))/(Math.log1p(maximum)-Math.log1p(minimum))*100));
});
function begin() {
 if(adjusting.value || props.disabled || props.maximum <= props.minimum) return;
 range = { minimum: props.minimum, maximum: props.maximum };
 draftPosition.value = position.value;
 adjusting.value = true;
 emit('begin');
}
function startPointer(event: PointerEvent) { if(event.button === 0) begin(); }
function startKey(event: KeyboardEvent) {
 if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)) return;
 begin();
 if (!adjusting.value) return;
 event.preventDefault();
 event.stopPropagation();
 const forward = ['ArrowRight','ArrowUp','PageUp'].includes(event.key);
 const currentPosition = position.value;
 const nextPosition = event.key === 'Home' ? 0 : event.key === 'End' ? 100
  : Math.max(0, Math.min(100, currentPosition + (forward ? 0.1 : -0.1)));
 const value = props.label === 'Miners'
  ? event.key === 'Home' ? range.minimum : event.key === 'End' ? range.maximum
    : Math.max(range.minimum, Math.min(range.maximum, props.value + (forward ? 1 : -1)))
  : nextPosition === 0 ? range.minimum : nextPosition === 100 ? range.maximum
    : Math.expm1(Math.log1p(range.minimum) + nextPosition / 100 * (Math.log1p(range.maximum) - Math.log1p(range.minimum)));
 draftPosition.value = (Math.log1p(value) - Math.log1p(range.minimum)) / (Math.log1p(range.maximum) - Math.log1p(range.minimum)) * 100;
 emit('change', props.label === 'Miners' ? Math.round(value) : value);
}
function update(values: number[] | undefined) {
 if(props.disabled || !values?.length) return;
 begin();
 draftPosition.value = values[0]!;
 const progress = values[0]! / 100;
 const value = progress <= 0 ? range.minimum : progress >= 1 ? range.maximum
  : Math.expm1(Math.log1p(range.minimum)+progress*(Math.log1p(range.maximum)-Math.log1p(range.minimum)));
 emit('change', props.label === 'Miners' ? Math.round(value) : value);
}
async function finish() {
 await nextTick();
 if(!adjusting.value) return;
 adjusting.value = false;
 emit('end');
}
const exact = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: props.label === 'Miners' ? 0 : 2 });
const compact = (n: number) => n >= 1000 ? n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 }) : exact(n);
</script>
