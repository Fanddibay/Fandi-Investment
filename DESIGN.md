# DESIGN.md — PortfolioHQ Design System

> Single source of truth for visual tokens, component patterns, and motion.
> Read this before writing any UI code.

---

## Color System

This is a **dark-only** dashboard. Three layers of surface depth, one border color, one accent.

### Surfaces

| Token | Hex | Usage |
|---|---|---|
| `surface-base` | `#0f1117` | Page background, inputs, code blocks |
| `surface-card` | `#1a1d27` | Cards, panels, sidebar, modals |
| `surface-hover` | `#1e2233` | Card hover state |
| `surface-subtle` | `#22263a` | Active nav item bg, symbol tag bg, nav hover |

```
Depth order:  #0f1117  →  #1a1d27  →  #1e2233  →  #22263a
              (deepest)                            (lightest)
```

### Border

Single border tone used everywhere. Never use opacity variants — consistency matters.

| Token | Hex | Usage |
|---|---|---|
| `border-default` | `#2e3348` | All card, input, modal, nav borders |
| `border-accent` | `sky-500/40` | Card hover highlight only |

### Accent — Sky

The brand color. Used for CTAs, active states, links, the logo.

| Usage | Class |
|---|---|
| Primary button, logo | `bg-sky-500` |
| Button hover | `bg-sky-400` |
| Links, icon tints | `text-sky-400` |
| Active filter/nav | `border-sky-500 bg-sky-500/10 text-sky-400` |
| Focus ring on inputs | `focus:border-sky-500` |
| Icon bg chip | `bg-sky-500/10 text-sky-400` |

### Semantic — P&L / Sentiment

| State | Background | Text |
|---|---|---|
| Positive / green | `bg-green-500/10` | `text-green-400` |
| Negative / red | `bg-red-500/10` | `text-red-400` |
| Neutral / inactive | `bg-slate-500/10` | `text-slate-400` |
| Warning / unset | `bg-yellow-500/10` | `text-yellow-400` |

### Text Scale

| Role | Class |
|---|---|
| Page title | `text-white font-bold text-2xl` |
| Section title | `text-white font-semibold text-lg` |
| Card title / label | `text-white font-semibold text-sm` |
| Body / description | `text-slate-400 text-sm` |
| Caption / meta | `text-slate-500 text-xs` |
| Disabled / placeholder | `text-slate-600` |

---

## Asset Color Palette

Each asset has a branded identity color used for the avatar chip (`bg: color + 22`, `text: color`).

| Symbol | Hex | Personality |
|---|---|---|
| QQQ | `#0ea5e9` | Tech blue (sky) |
| SPY | `#8b5cf6` | Market purple |
| ANTM.JK | `#f59e0b` | Mining amber |
| GOLD-ANTAM | `#d97706` | Gold amber (darker) |
| REKSADANA | `#10b981` | Growth green |
| OBLIGASI | `#06b6d4` | Fixed cyan |
| Fallback | `#94a3b8` | Slate neutral |

When adding a new asset, add an entry to `assetColors` in `PortfolioCard.vue`.

---

## Spacing & Radius

| Scale | Value | Used for |
|---|---|---|
| `gap-1` / `p-1` | 4px | Tight icon padding |
| `gap-2` / `p-2` | 8px | Small chip padding |
| `gap-3` / `p-3` | 12px | Button padding, nav item |
| `gap-4` / `p-4` | 16px | Card inner padding (stat cards) |
| `gap-5` / `p-5` | 20px | Card inner padding (portfolio cards) |
| `p-6` | 24px | Modal, settings panel padding |

| Radius | Value | Used for |
|---|---|---|
| `rounded-lg` | 8px | Inputs, small buttons, tags |
| `rounded-xl` | 12px | News items, filter chips |
| `rounded-2xl` | 16px | Cards, modals, sidebar sections |
| `rounded-full` | 9999px | Status badges, sentiment pills |

---

## Component Patterns

### Card

The primary container. Used for holdings, stats, settings panels.

```html
<div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5">
```

With hover (for clickable cards):
```html
<div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-5
            hover:border-sky-500/40 hover:bg-[#1e2233]
            transition-all duration-300">
```

### Stat Card (smaller, 4-up grid)

```html
<div class="bg-[#1a1d27] border border-[#2e3348] rounded-2xl p-4">
  <p class="text-xs text-slate-500 mb-2">Label</p>
  <p class="text-xl font-bold text-white">Value</p>
  <p class="text-xs text-slate-500 mt-1">Sub-label</p>
</div>
```

### Input

```html
<input class="w-full bg-[#0f1117] border border-[#2e3348] rounded-lg
              px-3 py-2.5 text-sm text-white placeholder-slate-600
              focus:border-sky-500 focus:outline-none transition-colors" />
```

### Primary Button

```html
<button class="px-4 py-2.5 rounded-xl bg-sky-500 text-white text-sm font-medium
               hover:bg-sky-400 transition-all duration-200 active:scale-95">
```

`active:scale-95` is required on all primary buttons — it provides tactile click feedback.

### Ghost Button

```html
<button class="px-4 py-2.5 rounded-lg border border-[#2e3348]
               text-slate-400 text-sm hover:border-slate-500
               transition-colors disabled:opacity-40">
```

### Status Badge (pill)

```html
<!-- positive -->
<span class="text-xs px-2 py-1 rounded-full bg-green-500/10 text-green-400">+2.4%</span>
<!-- negative -->
<span class="text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400">-1.1%</span>
<!-- neutral / info -->
<span class="text-xs px-2 py-1 rounded-full bg-sky-500/10 text-sky-400">active</span>
```

### Icon Chip

Small colored square that identifies a section or asset:

```html
<div class="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
  <!-- icon here, text-sky-400 -->
</div>
```

### Section Label + Description

Standard header pattern used at the top of every settings card:

```html
<div class="flex items-center gap-3 mb-5">
  <div class="w-9 h-9 rounded-xl bg-sky-500/10 ..."> <!-- icon chip --> </div>
  <div>
    <h2 class="font-semibold text-white text-sm">Title</h2>
    <p class="text-xs text-slate-500">Subtitle</p>
  </div>
  <div class="ml-auto"> <!-- optional badge --> </div>
</div>
```

---

## Motion & Animation

All transitions use `transition-all duration-200` as the baseline. Exceptions below.

| Element | Motion | Classes |
|---|---|---|
| Card hover | Color + border shift | `transition-all duration-300` |
| Button press | Scale tap | `active:scale-95` |
| Route change | Opacity fade | `fade` transition (in `App.vue`) |
| Modal entry | Opacity + scale-up | `modal` transition (in `AddHoldingModal.vue`) |
| Spin (loading) | Continuous rotate | `animate-spin` |
| Skeleton pulse | Breathing opacity | `animate-pulse` |
| Status pill | Fade + slide up | `status` transition (in `Settings.vue`) |
| Sidebar | Width collapse | `transition-all duration-300` on `<aside>` |

### Page Transition (App.vue)
```css
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
```

### Modal Transition (AddHoldingModal.vue)
```css
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .relative { transition: transform 0.2s; }
.modal-enter-from .relative { transform: scale(0.95) translateY(10px); }
```

### Status Pill Transition (Settings.vue)
```css
.status-enter-active, .status-leave-active { transition: opacity .25s ease, transform .25s ease; }
.status-enter-from, .status-leave-to { opacity: 0; transform: translateY(-4px); }
```

**Rule:** every interactive element needs at least a color transition. Buttons need `active:scale-95`. Cards that are links need a hover border shift. Never show state changes without motion.

---

## Layout

### Shell

```
[sidebar 64px mobile / 224px desktop] + [main content flex-1]
```

- Sidebar: `fixed left-0 top-0 h-screen w-16 lg:w-56`
- Main: `ml-16 lg:ml-56`, content inside `max-w-6xl mx-auto px-4 py-8 lg:px-8`

### Grid Patterns

| Layout | Classes |
|---|---|
| Summary bar (4 stats) | `grid grid-cols-2 lg:grid-cols-4 gap-4` |
| Holdings grid | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4` |
| Form 2-column | `grid grid-cols-2 gap-3` |
| Settings max-width | `max-w-2xl` |

---

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use `#0f1117` for inputs/code areas | Use white or gray backgrounds |
| Use `rounded-2xl` for all cards | Mix different radii on the same layer |
| Use `active:scale-95` on primary CTAs | Add scale to ghost/destructive buttons |
| Use `text-xs` for all meta / captions | Use `text-sm` for secondary info |
| Use bg/10 + matching text for badges | Use solid backgrounds for status pills |
| Add a `transition-colors` to every interactive element | Leave interactive elements with no hover state |
| Reference asset colors from `assetColors` map | Hardcode hex values directly in templates |
