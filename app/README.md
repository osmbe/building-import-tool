# Nuxt 3 + shadcn-vue: Buildings Mapping Tool (Vue Port)

This folder contains Vue/Nuxt 3 components converted from your Next.js + shadcn React demo.
They use **shadcn-vue** primitives (`@/components/ui/*`) and `lucide-vue-next` icons.

## What’s included

- `pages/index.vue` – main page with fixed Navigation and InteractiveMap area
- `components/Navigation.vue` – top bar (search, theme toggle, auth)
- `components/SearchBar.vue` + `components/SearchResults.vue`
- `components/UserMenu.vue`
- `components/AuthDialog.vue`
- `components/InteractiveMap.vue` – map placeholder with controls and layer toggles
- `components/ObjectInfoPanel.vue` – right drawer-like panel with tabs
- `components/QAToolsPanel.vue` – simple QA operations list
- `composables/useAuth.ts` – mock OSM auth (localStorage)
- `composables/useSearch.ts` – mock geocoder + history
- `composables/useBuildingData.ts` – mock buildings
- minimal `nuxt.config.ts`, `app.vue`, and Tailwind base

> NOTE: The "map" is a styled placeholder. Plug in your preferred map lib (OpenLayers, MapLibre, Leaflet) where `InteractiveMap.vue` currently simulates clicks.

## Install

In your Nuxt app, install:

- shadcn-vue (and generate the UI components you need)
- lucide-vue-next
- tailwindcss + postcss (if not already)

```bash
pnpm add lucide-vue-next
# or npm i lucide-vue-next
```

Set up **shadcn-vue** following its docs, so imports like `@/components/ui/button` resolve.

## Theme toggle

If you use `@nuxtjs/color-mode`, remove the manual `setTheme` logic in `Navigation.vue`.
Otherwise, the component toggles the `dark` class on `<html>`.

## Hooking a real map

Replace the placeholder in `InteractiveMap.vue` with your map component and call `panelOpen = true` and `activeBuilding = ...` when a feature is clicked.

## Paths

Components import shadcn-vue as `@/components/ui/*`. Adjust if your generator outputs a different path.

Have fun!
