<template>
  <TooltipProvider :delay-duration="150"><TooltipRoot>
    <TooltipTrigger class="formula-trigger" :aria-label="label">ƒ<sub>x</sub></TooltipTrigger>
    <TooltipPortal><TooltipContent class="formula-tooltip" :side-offset="12" :collision-padding="16">
      <strong>{{ label }}</strong><p>{{ description }}</p><TooltipArrow class="tooltip-arrow" />
    </TooltipContent></TooltipPortal>
  </TooltipRoot></TooltipProvider>
</template>
<script setup lang="ts">
import { TooltipProvider, TooltipRoot, TooltipTrigger, TooltipPortal, TooltipContent, TooltipArrow } from 'reka-ui';
defineProps<{ label: string; description: string }>();
</script>
