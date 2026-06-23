<template>
  <aside class="fixed left-0 top-0 h-screen w-16 lg:w-56 bg-[#1a1d27] border-r border-[#2e3348] flex flex-col z-40 transition-all duration-300">
    <!-- Logo -->
    <div class="h-16 flex items-center justify-center lg:justify-start lg:px-5 border-b border-[#2e3348]">
      <div class="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
        <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/>
        </svg>
      </div>
      <span class="hidden lg:block ml-3 font-semibold text-white text-sm">PortfolioHQ</span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 py-4 px-2 space-y-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#22263a] transition-all duration-200 group"
        active-class="!text-white !bg-[#22263a] border border-[#2e3348]"
      >
        <component :is="item.icon" class="w-5 h-5 shrink-0" />
        <span class="hidden lg:block text-sm font-medium">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <!-- Refresh indicator -->
    <div class="p-3 border-t border-[#2e3348]">
      <button
        @click="$emit('refresh')"
        class="w-full flex items-center justify-center lg:justify-start gap-2 px-3 py-2 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-[#22263a] transition-all duration-200 text-xs"
      >
        <svg class="w-4 h-4 shrink-0" :class="{ 'animate-spin': refreshing }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        <span class="hidden lg:block">Refresh</span>
      </button>
    </div>
  </aside>
</template>

<script setup>
import { RouterLink } from 'vue-router'
import { defineEmits, defineProps } from 'vue'

defineProps({ refreshing: Boolean })
defineEmits(['refresh'])

const navItems = [
  {
    path: '/',
    label: 'Dashboard',
    icon: {
      render() {
        return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' })
        ])
      }
    }
  },
  {
    path: '/assets',
    label: 'Assets',
    icon: {
      render() {
        return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10m0-10L4 7' })
        ])
      }
    }
  },
  {
    path: '/news',
    label: 'News',
    icon: {
      render() {
        return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' })
        ])
      }
    }
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: {
      render() {
        return h('svg', { class: 'w-5 h-5', fill: 'none', stroke: 'currentColor', viewBox: '0 0 24 24' }, [
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' }),
          h('path', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-width': '2', d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0' })
        ])
      }
    }
  },
]

import { h } from 'vue'
</script>
