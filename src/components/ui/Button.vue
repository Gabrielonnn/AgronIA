<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  variant?: 'primary' | 'danger' | 'alert' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}>(), {
  variant: 'primary',
  size: 'md',
  disabled: false
})

const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-agron-green hover:bg-agron-green-dark text-white focus:ring-agron-green'
    case 'danger':
      return 'bg-agron-danger hover:bg-red-600 text-white focus:ring-agron-danger'
    case 'alert':
      return 'bg-agron-alert hover:bg-orange-600 text-white focus:ring-agron-alert'
    case 'outline':
      return 'border-2 border-agron-green text-agron-green hover:bg-agron-green-light focus:ring-agron-green'
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'px-3 py-1.5 text-sm'
    case 'md': return 'px-4 py-2 text-base'
    case 'lg': return 'px-6 py-3 text-lg'
  }
})
</script>

<template>
  <button 
    :class="[baseClasses, variantClasses, sizeClasses, { 'opacity-50 cursor-not-allowed': disabled }]"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
