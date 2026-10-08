<script setup lang="ts">
// Tarjeta base para paneles y widgets
</script>

<template>
  <div class="app-card bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
    <div v-if="$slots.header" class="app-card-header px-6 py-4 border-b border-gray-100">
      <slot name="header" />
    </div>
    
    <div class="app-card-body p-6">
      <slot />
    </div>

    <div v-if="$slots.footer" class="app-card-footer px-6 py-4 bg-gray-50 border-t border-gray-100">
      <slot name="footer" />
    </div>
  </div>
</template>
