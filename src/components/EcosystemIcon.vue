<template>
  <svg viewBox="0 0 80 64" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <g v-if="kind === 'miners'">
      <circle cx="40" cy="12" r="6" /><circle cx="21" cy="17" r="5" /><circle cx="59" cy="17" r="5" />
      <path d="M31 57V39h-5V29q0-8 14-8t14 8v10h-5v18M35 32v25m10-25v25M17 54V37h-5v-9q0-6 11-6m-1 11v21M63 54V37h5v-9q0-6-11-6m1 11v21M40 43v14" />
    </g>
    <g v-else-if="kind === 'coins'">
      <g v-for="(x, i) in [8,30,52]" :key="x" :transform="`translate(${x} ${i === 1 ? 4 : 14})`"><path d="M0 16v23c0 7 22 7 22 0V16M0 23c0 7 22 7 22 0M0 31c0 7 22 7 22 0" /><ellipse cx="11" cy="16" rx="11" ry="5" /></g>
    </g>
    <g v-else-if="kind === 'bitcoin'"><circle cx="40" cy="31" r="26" /><circle cx="40" cy="31" r="22" /><path d="M31 17h11q15 0 10 11-2 3-8 3H31m0 0h14q14 0 9 11-2 4-11 4H31M35 17v29m3-34v4m7-4v4m-7 30v5m7-5v5" /></g>
    <g v-else><path d="M33 17l-6-9 10 2 6-5 6 5 10-2-7 10M33 20C18 33 17 56 30 57h29c13-1 9-25-8-37M32 18h22M46 23l7 7" /><path d="M35 46l7-17 7 17m-12-6h10m-14 4h18" /><ellipse cx="17" cy="45" rx="7" ry="3" /><path d="M10 45v13c0 5 14 5 14 0V45m-14 6c0 5 14 5 14 0" /></g>
  </svg>
</template>
<script setup lang="ts">
defineProps<{ kind: 'miners' | 'coins' | 'payout' | 'bitcoin' }>();
</script>
