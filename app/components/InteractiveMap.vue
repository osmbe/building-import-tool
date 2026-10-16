<template>
  <div class="h-full w-full">
    <div class="h-full w-full relative">
      <!-- OpenLayers Map Container -->
      <div
        id="map"
        ref="mapRef"
        class="absolute inset-0"
        :class="currentBaseLayer === 'blank' ? 'bg-[#f5f0e8]' : ''"
        style="width: 100%; height: 100%; min-height: 400px"
      ></div>

      <!-- First-run guidance -->
      <GettingStartedCard :has-candidates="candidateBuildingCount > 0" />

      <!-- Top-right: Map Controls Panel -->
      <div class="absolute right-4 top-4 flex flex-col gap-2 w-44">
        <div class="glass-panel rounded-lg overflow-hidden">
          <!-- Header -->
          <div
            class="flex items-center justify-between px-2.5 py-2 cursor-pointer select-none"
            :class="!controlsCollapsed ? 'border-b border-white/[0.05]' : ''"
            @click="controlsCollapsed = !controlsCollapsed"
          >
            <span class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Controls</span>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground transition-transform duration-200"
              :class="controlsCollapsed ? '-rotate-90' : ''"
            />
          </div>

          <!-- Collapsible body -->
          <div v-show="!controlsCollapsed">
            <!-- Zoom controls -->
            <div class="flex items-center gap-1 p-2 border-b border-white/[0.05]">
              <button class="map-icon-btn" @click="zoomIn" title="Zoom in" aria-label="Zoom in">
                <ZoomIn class="h-3.5 w-3.5" />
              </button>
              <button class="map-icon-btn" @click="zoomOut" title="Zoom out" aria-label="Zoom out">
                <ZoomOut class="h-3.5 w-3.5" />
              </button>
              <button class="map-icon-btn" @click="resetView" title="Reset view" aria-label="Reset view">
                <RotateCcw class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Base layer selection -->
            <div class="p-2 border-b border-white/[0.05]">
              <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Basemap</div>
              <div class="flex flex-wrap gap-1">
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'blank' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('blank')"
                  title="No background"
                >
                  Blank
                </button>
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'osm' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('osm')"
                  title="OpenStreetMap Belgium (tile.openstreetmap.be)"
                >
                  OSM
                </button>
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'esri' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('esri')"
                  title="Esri World Imagery (Maxar/Earthstar) — mosaic, dates vary by area — Belgium only"
                >
                  Esri
                </button>
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'flanders' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('flanders')"
                  title="Orthophoto Vlaanderen — Digitaal Vlaanderen (OFW, always latest)"
                >
                  Flanders <span class="opacity-60">latest</span>
                </button>
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'brussels' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('brussels')"
                  title="Ortho UrbIS 2024 (nadir) — geoservices-urbis.irisnet.be"
                >
                  Brussels <span class="opacity-60">'24</span>
                </button>
                <button
                  class="layer-btn"
                  :class="currentBaseLayer === 'wallonia' ? 'layer-btn-active' : ''"
                  @click="switchBaseLayer('wallonia')"
                  title="Orthophoto Wallonie 2024 — geoservices.wallonie.be"
                >
                  Wallonia <span class="opacity-60">'24</span>
                </button>
              </div>
            </div>

            <!-- Prerequisite checklist (shown until everything is ready) -->
            <div v-if="!canCalculateDifference" class="px-2 pt-2 pb-1.5 space-y-1 border-b border-white/[0.05]">
              <div class="text-[8px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                Before you start
              </div>
              <button class="check-row" @click="revealLayersPanel">
                <span class="check-mark" :class="hasSourceLayer ? 'check-done' : ''"
                  ><Check v-if="hasSourceLayer" class="h-2 w-2"
                /></span>
                <span class="flex-1 text-left" :class="hasSourceLayer ? 'text-emerald-400/80' : ''"
                  >Source dataset on</span
                >
                <span v-if="!hasSourceLayer" class="check-action">Layers</span>
              </button>
              <button class="check-row" @click="revealLayersPanel">
                <span class="check-mark" :class="hasOsmLayer ? 'check-done' : ''"
                  ><Check v-if="hasOsmLayer" class="h-2 w-2"
                /></span>
                <span class="flex-1 text-left" :class="hasOsmLayer ? 'text-emerald-400/80' : ''">OSM Buildings on</span>
                <span v-if="!hasOsmLayer" class="check-action">Layers</span>
              </button>
              <button class="check-row" @click="zoomToWorkingLevel">
                <span class="check-mark" :class="zoomReady ? 'check-done' : ''"
                  ><Check v-if="zoomReady" class="h-2 w-2"
                /></span>
                <span class="flex-1 text-left" :class="zoomReady ? 'text-emerald-400/80' : ''">Zoom in to ≥ 16</span>
                <span v-if="!zoomReady" class="check-action">Zoom</span>
              </button>
            </div>

            <!-- Actions -->
            <div class="p-2 space-y-1">
              <button
                class="action-btn w-full"
                :disabled="!canCalculateDifference || isCalculatingDifference"
                title="Get Difference (G)"
                aria-label="Get Difference"
                @click="calculateDifference"
              >
                <Loader2 v-if="isCalculatingDifference" class="h-3 w-3 animate-spin shrink-0" />
                <GitCompareArrows v-else class="h-3 w-3 shrink-0" />
                <span>{{ isCalculatingDifference ? 'Calculating…' : 'Get Difference' }}</span>
              </button>
              <button
                class="action-btn w-full"
                :disabled="!canExportToJOSM"
                title="Open in JOSM (J)"
                aria-label="Open candidates in JOSM"
                @click="exportToJOSM"
              >
                <ExternalLink class="h-3 w-3 shrink-0" />
                <span>Open in JOSM</span>
              </button>

              <!-- JOSM connection status -->
              <div class="flex items-center justify-between px-0.5 pt-1">
                <div class="flex items-center gap-1.5">
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="
                      josmConnected === true
                        ? 'bg-emerald-400'
                        : josmConnected === false
                          ? 'bg-red-400'
                          : 'bg-muted-foreground/40'
                    "
                  ></span>
                  <span class="text-[9px] text-muted-foreground">
                    {{
                      josmConnected === true ? 'JOSM ready' : josmConnected === false ? 'JOSM offline' : 'JOSM unknown'
                    }}
                  </span>
                </div>
                <button
                  class="text-[9px] text-primary/80 hover:text-primary transition-colors"
                  @click="josmHelpOpen = true"
                >
                  Set up
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-left: Layers Panel -->
      <div class="absolute bottom-4 left-4">
        <div class="glass-panel rounded-lg overflow-hidden">
          <!-- Header -->
          <div
            class="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
            :class="!layersCollapsed ? 'border-b border-white/[0.05]' : ''"
            @click="layersCollapsed = !layersCollapsed"
          >
            <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Layers</h3>
            <ChevronDown
              class="h-3 w-3 text-muted-foreground transition-transform duration-200"
              :class="layersCollapsed ? '-rotate-90' : ''"
            />
          </div>

          <!-- Collapsible body -->
          <div v-show="!layersCollapsed" class="p-3 min-w-[220px]">
            <div class="space-y-2.5">
              <div class="layer-row">
                <div class="flex items-center gap-2">
                  <span class="layer-dot" style="color: hsl(var(--layer-candidate)); background: currentColor"></span>
                  <span class="text-xs text-foreground/85">Candidate Buildings</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono text-muted-foreground">{{ candidateBuildingCount }}</span>
                  <Switch
                    v-model:checked="overlayLayers.candidateBuildings"
                    @update:checked="toggleCandidateBuildings"
                  />
                </div>
              </div>
              <div class="layer-row">
                <div class="flex items-center gap-2">
                  <span class="layer-dot" style="color: hsl(var(--layer-osm)); background: currentColor"></span>
                  <span class="text-xs text-foreground/85">OSM Buildings</span>
                </div>
                <Switch v-model:checked="overlayLayers.osmBuildings" @update:checked="toggleOsmBuildings" />
              </div>
            </div>

            <!-- Source dataset (single-select; compared against OSM) -->
            <div class="mt-3 pt-3 border-t border-white/[0.05]">
              <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Source dataset
              </div>
              <div class="grid grid-cols-2 gap-1">
                <button
                  v-for="opt in sourceOptions"
                  :key="opt.key"
                  class="layer-btn flex items-center justify-center gap-1.5"
                  :class="selectedSource === opt.key ? 'layer-btn-active' : ''"
                  :title="dataDateTitle(opt.key, opt.label)"
                  @click="selectSource(opt.key)"
                >
                  <span
                    class="layer-dot"
                    :style="{ color: `hsl(var(${opt.varName}))`, background: 'currentColor' }"
                  ></span>
                  {{ opt.label }}
                </button>
              </div>
              <p class="text-[9px] text-muted-foreground/70 mt-1.5 leading-relaxed">
                One dataset at a time, compared against OSM Buildings.
              </p>
            </div>
            <div class="mt-3 pt-3 border-t border-white/[0.05] space-y-1">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-muted-foreground">Zoom</span>
                <span class="font-mono text-foreground/55">{{ currentZoom }}</span>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-muted-foreground">Center</span>
                <span class="font-mono text-foreground/55"
                  >{{ currentCenter[1].toFixed(4) }}, {{ currentCenter[0].toFixed(4) }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-right: Match Mode + Stats stacked -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-2 w-56">
        <!-- Results panel (loading / empty / error / success) -->
        <div v-if="differenceState !== 'idle'" class="glass-panel rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Results</h3>
              <span
                v-if="useOverpass"
                class="inline-flex items-center gap-1 px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 border border-emerald-400/20"
              >
                <span class="h-1 w-1 rounded-full bg-emerald-400"></span>
                Live
              </span>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss results"
              @click="dismissResults"
            >
              <X class="h-3 w-3" />
            </button>
          </div>

          <!-- Loading -->
          <div
            v-if="differenceState === 'loading'"
            class="flex items-center gap-2 text-[11px] text-muted-foreground py-1"
          >
            <Loader2 class="h-3 w-3 animate-spin shrink-0" />
            <span>Searching this view…</span>
          </div>

          <!-- Error -->
          <div v-else-if="differenceState === 'error'" class="space-y-2">
            <div class="flex items-start gap-2 text-[11px] text-red-300/90">
              <CircleAlert class="h-3.5 w-3.5 shrink-0 mt-px text-red-400" />
              <span>Could not calculate the difference.</span>
            </div>
            <p v-if="differenceError" class="text-[10px] text-muted-foreground break-words leading-relaxed">
              {{ differenceError }}
            </p>
            <button class="result-retry" @click="calculateDifference">
              <RotateCcw class="h-2.5 w-2.5" />
              Retry
            </button>
          </div>

          <!-- Empty -->
          <div v-else-if="differenceState === 'empty'" class="space-y-1.5">
            <p class="text-[11px] text-foreground/85">No missing buildings here.</p>
            <p class="text-[10px] text-muted-foreground leading-relaxed">
              Everything in view already matches OSM. Pan to a new area, lower the match strictness, or switch match
              mode.
            </p>
            <p class="text-[9px] text-muted-foreground/70 pt-0.5">{{ matchSummary }}</p>
          </div>

          <!-- Success -->
          <div v-else-if="differenceState === 'success' && matchingStats" class="space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Source total</span>
              <span class="font-mono text-foreground/65">{{ matchingStats.totalGrb }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">OSM total</span>
              <span class="font-mono text-foreground/65">{{ matchingStats.totalOsm }}</span>
            </div>
            <div class="pt-2 mt-1 border-t border-white/[0.05] space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-emerald-400/90">Matched</span>
                <span class="font-mono font-medium text-emerald-400">{{ matchingStats.matched }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sky-400/90">Candidates</span>
                <span class="font-mono font-medium text-sky-400">{{ matchingStats.unmatched }}</span>
              </div>
            </div>
            <div class="pt-2 border-t border-white/[0.05]">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-muted-foreground">Coverage</span>
                <span class="font-mono text-primary font-medium">{{ coveragePct }}%</span>
              </div>
              <div class="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary/75 rounded-full transition-all duration-700"
                  :style="{ width: coveragePct + '%' }"
                ></div>
              </div>
            </div>
            <!-- Cap notice when there are more candidates than we render/export at once -->
            <div v-if="candidateCapped" class="flex items-start gap-1.5 pt-2 text-[10px] text-amber-300/90">
              <CircleAlert class="h-3 w-3 shrink-0 mt-px text-amber-400" />
              <span
                >Showing the first {{ candidateBuildingCount.toLocaleString() }} of
                {{ candidateTotalInView.toLocaleString() }}. Zoom in to review the rest.</span
              >
            </div>

            <!-- Optional simplification before export -->
            <div class="pt-2 mt-1 border-t border-white/[0.05]">
              <label class="flex items-center justify-between gap-2 cursor-pointer select-none">
                <span class="text-[10px] text-foreground/80">Simplify geometry on export</span>
                <input type="checkbox" class="accent-primary h-3 w-3" v-model="simplifyOnExport" />
              </label>
              <div v-if="simplifyOnExport" class="mt-1.5 flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="98"
                  step="1"
                  class="flex-1 accent-primary"
                  v-model.number="simplifyPercent"
                />
                <span class="font-mono text-[10px] text-foreground/60 w-8 text-right">{{ simplifyPercent }}%</span>
              </div>
              <p v-if="simplifyOnExport" class="text-[9px] text-muted-foreground/70 mt-1 leading-relaxed">
                Keeps {{ simplifyPercent }}% of detail. Reduces node count on dense GRB outlines.
              </p>
            </div>

            <p class="text-[9px] text-muted-foreground/70 pt-1.5 leading-relaxed">
              {{ matchSummary }}. Open in JOSM to review before upload.
            </p>
          </div>
        </div>

        <!-- Match Mode Control -->
        <MatchModeControl
          :source-supports-tags="supportsSourceTags(selectedSource === 'none' ? 'grb' : selectedSource)"
        />
      </div>

      <ObjectInfoPanel :building="activeBuilding" :is-open="panelOpen" @close="panelOpen = false" />

      <!-- JOSM setup help -->
      <JosmHelpDialog
        v-model:open="josmHelpOpen"
        :connected="josmConnected"
        :testing="josmTesting"
        :instructions="josmInstructions"
        @test="checkJosm"
      />

      <!-- Feature Info Panel (hover / click) -->
      <div
        v-if="hoveredFeatures.length > 0 || isTooltipSticky"
        :class="isTooltipSticky ? 'pointer-events-auto' : 'pointer-events-none'"
        class="absolute top-4 left-4 z-50 w-80"
      >
        <div class="glass-panel rounded-lg overflow-hidden">
          <template v-if="activeFeatures.length > 0">
            <!-- Feature switcher pills (shown when multiple features) -->
            <div v-if="activeFeatures.length > 1" class="flex items-center gap-1.5 px-3 pt-3 pb-1">
              <button
                v-for="(feat, idx) in activeFeatures"
                :key="idx"
                class="feature-pill"
                :class="{
                  'feature-pill--grb': feat._layer_type === 'grb',
                  'feature-pill--knw': feat._layer_type === 'knw',
                  'feature-pill--picc': feat._layer_type === 'picc',
                  'feature-pill--urbis': feat._layer_type === 'urbis',
                  'feature-pill--osm': feat._layer_type === 'osm',
                  'feature-pill--active': idx === activeFeatureIndex
                }"
                @click="activeFeatureIndex = idx"
              >
                <span class="feature-pill__dot" />
                <span>{{
                  feat._layer_type === 'grb'
                    ? 'GRB'
                    : feat._layer_type === 'knw'
                      ? 'KNW'
                      : feat._layer_type === 'picc'
                        ? 'PICC'
                        : feat._layer_type === 'urbis'
                          ? 'Urbis'
                          : 'OSM'
                }}</span>
                <span class="opacity-50 font-mono">{{
                  feat._layer_type === 'osm' ? feat.osm_id : candidateDisplayId(feat)
                }}</span>
              </button>
              <!-- Close button -->
              <button
                v-if="isTooltipSticky"
                class="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0"
                @click="closeTooltip"
              >
                <X class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Active feature content -->
            <div class="p-4" :key="activeFeatureIndex">
              <!-- GRB Building -->
              <template v-if="currentFeature._layer_type === 'grb'">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div
                      class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-grb border px-1.5 py-0.5 rounded mb-1.5"
                    >
                      <Building2 class="h-2.5 w-2.5" />GRB
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">
                      {{ formatGRBBuildingType(currentFeature.type_label || currentFeature.parent_type_label) }}
                    </h2>
                    <div v-if="currentFeature.parent_id" class="text-[10px] font-mono text-muted-foreground mt-0.5">
                      Building ID: {{ currentFeature.parent_id }}
                    </div>
                    <div v-if="currentFeature.source_ref" class="text-[10px] font-mono text-muted-foreground">
                      OIDN: {{ currentFeature.source_ref }}
                    </div>
                  </div>
                  <button
                    v-if="isTooltipSticky && activeFeatures.length <= 1"
                    class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                    @click="closeTooltip"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Addresses (grouped by base address) -->
                <div v-if="currentFeature.addresses" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Addresses
                  </div>
                  <div class="space-y-1">
                    <div
                      v-for="(group, idx) in groupAddresses(parsePostgresArray(currentFeature.addresses))"
                      :key="idx"
                    >
                      <div class="text-xs text-foreground font-medium">{{ group.base }}</div>
                      <div v-if="group.boxes.length > 0" class="text-[10px] text-muted-foreground mt-0.5 pl-2">
                        bus {{ group.boxes.join(', ') }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Location -->
                <div
                  v-if="
                    !currentFeature.addresses &&
                    (currentFeature.street_names || currentFeature.postcodes || currentFeature.municipalities)
                  "
                  class="mb-3"
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Location
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.street_names" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Street</span>
                      <span class="text-foreground font-medium">{{
                        parsePostgresArray(currentFeature.street_names).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.postcodes" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
                      <span class="text-foreground font-medium">{{
                        parsePostgresArray(currentFeature.postcodes).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.municipalities" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
                      <span class="text-foreground font-medium">{{
                        parsePostgresArray(currentFeature.municipalities).join(', ')
                      }}</span>
                    </div>
                  </div>
                </div>

                <!-- Details (only show if at least one field present) -->
                <div
                  v-if="
                    currentFeature.parent_area_m2 ||
                    currentFeature.parent_part_count ||
                    currentFeature.survey_date ||
                    currentFeature.origin_label
                  "
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Details
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.parent_area_m2" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Area</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatArea(currentFeature.parent_area_m2)
                      }}</span>
                    </div>
                    <div v-if="currentFeature.parent_part_count" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Parts</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.parent_part_count }}</span>
                    </div>
                    <div v-if="currentFeature.survey_date" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.survey_date }}</span>
                    </div>
                    <div v-if="currentFeature.origin_label" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Source</span>
                      <span class="text-foreground font-medium">{{
                        formatOriginLabel(currentFeature.origin_label)
                      }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- GRB KNW Structure -->
              <template v-else-if="currentFeature._layer_type === 'knw'">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div
                      class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-knw border px-1.5 py-0.5 rounded mb-1.5"
                    >
                      <Landmark class="h-2.5 w-2.5" />KNW
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">
                      {{ currentFeature.type_label || 'Structure' }}
                    </h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">
                      OIDN: {{ currentFeature.source_id }}
                    </div>
                  </div>
                  <button
                    v-if="isTooltipSticky && activeFeatures.length <= 1"
                    class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                    @click="closeTooltip"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  v-if="
                    currentFeature.area_m2 ||
                    candidateDetail(currentFeature, 'length_m') ||
                    currentFeature.survey_date ||
                    currentFeature.origin_label ||
                    currentFeature.type_code
                  "
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Details
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.type_code" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Type code</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.type_code }}</span>
                    </div>
                    <div v-if="currentFeature.area_m2" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Area</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatArea(currentFeature.area_m2)
                      }}</span>
                    </div>
                    <div v-if="candidateDetail(currentFeature, 'length_m')" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Length</span>
                      <span class="text-foreground font-medium font-mono"
                        >{{ Number(candidateDetail(currentFeature, 'length_m')).toFixed(2) }} m</span
                      >
                    </div>
                    <div v-if="currentFeature.survey_date" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.survey_date }}</span>
                    </div>
                    <div v-if="currentFeature.origin_label" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Source</span>
                      <span class="text-foreground font-medium">{{
                        formatOriginLabel(currentFeature.origin_label)
                      }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- PICC Building -->
              <template v-else-if="currentFeature._layer_type === 'picc'">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div
                      class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-picc border px-1.5 py-0.5 rounded mb-1.5"
                    >
                      <Building2 class="h-2.5 w-2.5" />PICC
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">{{ currentFeature.type_label || 'Building' }}</h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">
                      ID: {{ currentFeature.source_id }}
                    </div>
                  </div>
                  <button
                    v-if="isTooltipSticky && activeFeatures.length <= 1"
                    class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                    @click="closeTooltip"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Addresses -->
                <div v-if="currentFeature.addresses" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Addresses
                  </div>
                  <div class="space-y-0.5 text-xs">
                    <div
                      v-for="(addr, idx) in parseSemicolonList(currentFeature.addresses)"
                      :key="idx"
                      class="text-foreground font-medium"
                    >
                      {{ addr }}
                    </div>
                  </div>
                </div>

                <!-- Location (when no detailed addresses) -->
                <div
                  v-if="
                    !currentFeature.addresses &&
                    (currentFeature.street_names || currentFeature.postcodes || currentFeature.municipalities)
                  "
                  class="mb-3"
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Location
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.street_names" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Street</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.street_names).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.postcodes" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.postcodes).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.municipalities" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.municipalities).join(', ')
                      }}</span>
                    </div>
                  </div>
                </div>

                <!-- Details -->
                <div
                  v-if="
                    currentFeature.area_m2 ||
                    currentFeature.type_code ||
                    candidateDetail(currentFeature, 'date_modif') ||
                    currentFeature.survey_date
                  "
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Details
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.area_m2" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Area</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatArea(currentFeature.area_m2)
                      }}</span>
                    </div>
                    <div v-if="currentFeature.type_code" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Type</span>
                      <span class="text-foreground font-medium">{{
                        currentFeature.type_label || currentFeature.type_code
                      }}</span>
                    </div>
                    <div v-if="currentFeature.survey_date" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatPiccDate(currentFeature.survey_date)
                      }}</span>
                    </div>
                    <div v-if="candidateDetail(currentFeature, 'date_modif')" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Modified</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatPiccDate(String(candidateDetail(currentFeature, 'date_modif')))
                      }}</span>
                    </div>
                    <div v-if="candidateDetail(currentFeature, 'georef_id')" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">GeoRef</span>
                      <span
                        class="text-foreground font-medium font-mono text-[10px] truncate"
                        :title="String(candidateDetail(currentFeature, 'georef_id'))"
                        >{{ candidateDetail(currentFeature, 'georef_id') }}</span
                      >
                    </div>
                  </div>
                </div>
              </template>

              <!-- Urbis Building -->
              <template v-else-if="currentFeature._layer_type === 'urbis'">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div
                      class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-urbis border px-1.5 py-0.5 rounded mb-1.5"
                    >
                      <Building2 class="h-2.5 w-2.5" />Urbis
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">Building</h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">
                      ID: {{ currentFeature.source_id }}
                    </div>
                  </div>
                  <button
                    v-if="isTooltipSticky && activeFeatures.length <= 1"
                    class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                    @click="closeTooltip"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Addresses -->
                <div v-if="currentFeature.addresses" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Addresses
                  </div>
                  <div class="space-y-0.5 text-xs">
                    <div
                      v-for="(addr, idx) in parseSemicolonList(currentFeature.addresses)"
                      :key="idx"
                      class="text-foreground font-medium"
                    >
                      {{ addr }}
                    </div>
                  </div>
                </div>

                <!-- Location (when no detailed addresses) -->
                <div
                  v-if="
                    !currentFeature.addresses &&
                    (currentFeature.street_names || currentFeature.postcodes || currentFeature.municipalities)
                  "
                  class="mb-3"
                >
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Location
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.street_names" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Street</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.street_names).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.postcodes" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.postcodes).join(', ')
                      }}</span>
                    </div>
                    <div v-if="currentFeature.municipalities" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
                      <span class="text-foreground font-medium">{{
                        parseSemicolonList(currentFeature.municipalities).join(', ')
                      }}</span>
                    </div>
                  </div>
                </div>

                <!-- Details -->
                <div v-if="currentFeature.area_m2 || currentFeature.source_id">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Details
                  </div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.area_m2" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Area</span>
                      <span class="text-foreground font-medium font-mono">{{
                        formatArea(currentFeature.area_m2)
                      }}</span>
                    </div>
                    <div v-if="currentFeature.source_id" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">INSPIRE</span>
                      <span class="text-foreground font-medium font-mono text-[10px]">{{
                        currentFeature.source_id
                      }}</span>
                    </div>
                    <div v-if="currentFeature.parent_id" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Block</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.parent_id }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- OSM Building -->
              <template v-else>
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div
                      class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-osm border px-1.5 py-0.5 rounded mb-1.5"
                    >
                      <Building2 class="h-2.5 w-2.5" />OSM
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">
                      {{
                        (currentFeature.building && currentFeature.building !== 'yes'
                          ? currentFeature.building
                          : null) || 'Building'
                      }}
                    </h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">
                      ID: {{ currentFeature.osm_id }}
                    </div>
                  </div>
                  <button
                    v-if="isTooltipSticky && activeFeatures.length <= 1"
                    class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1"
                    @click="closeTooltip"
                  >
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
                <!-- Grouped OSM tags -->
                <!-- Address group -->
                <div v-if="getGroupedOsmProperties(currentFeature).address.length > 0" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Address
                  </div>
                  <div class="space-y-1 text-xs">
                    <div
                      v-for="[key, value] in getGroupedOsmProperties(currentFeature).address"
                      :key="key"
                      class="flex gap-3"
                    >
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{
                        formatPropertyKey(key)
                      }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{
                        formatPropertyValue(value)
                      }}</span>
                    </div>
                  </div>
                </div>
                <!-- GRB Source group -->
                <div v-if="getGroupedOsmProperties(currentFeature).source.length > 0" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    GRB Source
                  </div>
                  <div class="space-y-1 text-xs">
                    <div
                      v-for="[key, value] in getGroupedOsmProperties(currentFeature).source"
                      :key="key"
                      class="flex gap-3"
                    >
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{
                        formatPropertyKey(key)
                      }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{
                        formatPropertyValue(value)
                      }}</span>
                    </div>
                  </div>
                </div>
                <!-- Other properties -->
                <div v-if="getGroupedOsmProperties(currentFeature).other.length > 0">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
                    Properties
                  </div>
                  <div class="space-y-1 text-xs">
                    <div
                      v-for="[key, value] in getGroupedOsmProperties(currentFeature).other"
                      :key="key"
                      class="flex gap-3"
                    >
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{
                        formatPropertyKey(key)
                      }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{
                        formatPropertyValue(value)
                      }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <!-- Footer hints -->
          <div v-if="!isTooltipSticky" class="px-4 py-2 border-t border-white/[0.05]">
            <p class="text-[9px] text-muted-foreground text-center tracking-wide">Click to pin · Esc to close</p>
          </div>
          <div v-else-if="activeFeatures.length > 1" class="px-4 py-1.5 border-t border-white/[0.05]">
            <p class="text-[9px] text-muted-foreground text-center tracking-wide">
              {{ activeFeatureIndex + 1 }} / {{ activeFeatures.length }} features
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  GitCompareArrows,
  Landmark,
  Loader2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-vue-next'
import { Fill, Stroke, Style } from 'ol/style'
import { GeoJSON, MVT } from 'ol/format'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { fromLonLat, toLonLat } from 'ol/proj'
import Feature from 'ol/Feature'
import MatchModeControl from '~/components/MatchModeControl.vue'
import ObjectInfoPanel from '~/components/ObjectInfoPanel.vue'
import GettingStartedCard from '~/components/GettingStartedCard.vue'
import JosmHelpDialog from '~/components/JosmHelpDialog.vue'
import type { BuildingData } from '~/types/buildingData'
import type { SearchResult } from '~/composables/useSearch'
import Switch from '~/components/ui/switch.vue'
import VectorTileLayer from 'ol/layer/VectorTile'
import VectorTileSource from 'ol/source/VectorTile'
import { extractFeaturesFromLayer } from '~/utils/openlayers'
import { CANDIDATES_CONTRACT, candidateDetail, candidateDisplayId, candidateTileUrl } from '~/utils/candidates'
import { useAuth } from '~/composables/useAuth'
import { useJosmExport } from '~/composables/useJosmExport'
import { useMapLayers } from '~/composables/useMapLayers'
import { useMatchMode } from '~/composables/useMatchMode'
import { resolveMatchMode, supportsSourceTags } from '~/utils/matchMode'
import { useToast } from '~/composables/useToast'

const { selectedLocation } = defineProps<{ selectedLocation: SearchResult | null }>()

const mapRef = ref<HTMLElement>()
const { exportLayerToJosm, testJosmConnection, getJosmInstructions } = useJosmExport()
const josmInstructions = getJosmInstructions()
const { matchMode, geometryThreshold, useOverpass } = useMatchMode()
const toast = useToast()

// Use the map layers composable
const { map, currentBaseLayer, initializeMap, switchBaseLayer, destroy } = useMapLayers()

// OSM Buildings layer state
const osmBuildingsLayerRef = ref<any>(null)

// Live OSM layer (Overpass, issue #9): replaces the tile layer while "Live OSM data" is on
const liveOsmLayerRef = ref<any>(null)

// GRB Buildings layer state
const grbBuildingsLayerRef = ref<any>(null)
const isLoadingGRB = ref(false)

// GRB KNW structures layer state
const knwStructuresLayerRef = ref<any>(null)

// PICC Buildings layer state
const piccBuildingsLayerRef = ref<any>(null)

// Urbis Buildings layer state
const urbisBuildingsLayerRef = ref<any>(null)

// Candidate Buildings layer state
const candidateBuildingsLayerRef = ref<any>(null)
const candidateBuildingCount = ref(0)

// Building feature info panel state
const hoveredFeatures = ref<any[]>([])
const clickedFeatures = ref<any[]>([])
const isTooltipSticky = ref(false)
const activeFeatureIndex = ref(0)

// Sorted features currently being displayed (hover or pinned)
const activeFeatures = computed(() =>
  sortFeatures(isTooltipSticky.value ? clickedFeatures.value : hoveredFeatures.value)
)

// Currently selected feature from the switcher
const currentFeature = computed(() => activeFeatures.value[activeFeatureIndex.value] || activeFeatures.value[0])

// Reset switcher index when the feature list changes
watch(
  () => activeFeatures.value.length,
  () => {
    activeFeatureIndex.value = 0
  }
)

const controlsCollapsed = ref(false)
const layersCollapsed = ref(false)

// Overlay layers (can be combined)
const overlayLayers = ref({
  candidateBuildings: false,
  osmBuildings: true,
  grbBuildings: false,
  knwStructures: false,
  piccBuildings: false,
  urbisBuildings: false,
  conflicts: true,
  addresses: false,
  boundaries: false
})

const currentZoom = ref(8)
const currentCenter = ref<[number, number]>([4.3517, 50.8503])
const panelOpen = ref(false)
const activeBuilding = ref<BuildingData | null>(null)

// Matching stats state
const matchingStats = ref<{
  totalGrb: number
  totalOsm: number
  matched: number
  unmatched: number
} | null>(null)

// Candidate buildings state
const originalCandidateFeatures = ref<any[]>([]) // Store original features for reset
const isCalculatingDifference = ref(false) // Loading state for Get Difference button

// Workflow prerequisites (issue: turn gates into visible guidance).
// At least one source layer (GRB, KNW, PICC, or Urbis) must be loaded and visible.
const hasSourceLayer = computed(() =>
  Boolean(
    (grbBuildingsLayerRef.value && overlayLayers.value.grbBuildings) ||
    (knwStructuresLayerRef.value && overlayLayers.value.knwStructures) ||
    (piccBuildingsLayerRef.value && overlayLayers.value.piccBuildings) ||
    (urbisBuildingsLayerRef.value && overlayLayers.value.urbisBuildings)
  )
)
const hasOsmLayer = computed(() => Boolean(osmBuildingsLayerRef.value && overlayLayers.value.osmBuildings))
const zoomReady = computed(() => currentZoom.value >= 16)

// Computed property to check if Get Difference button should be enabled
const canCalculateDifference = computed(
  () => Boolean(map.value) && hasOsmLayer.value && zoomReady.value && hasSourceLayer.value
)

// Difference workflow lifecycle state, surfaced as a persistent results panel
// instead of disappearing toasts.
type DifferenceState = 'idle' | 'loading' | 'success' | 'empty' | 'error'
const differenceState = ref<DifferenceState>('idle')
const differenceError = ref('')

// Optional geometry simplification applied at export time (reuses the export's mapshaper path).
const simplifyOnExport = ref(false)
const simplifyPercent = ref(85)

// Soft cap on rendered/exported candidates (mass-import safety + browser performance).
const CANDIDATE_RENDER_CAP = 2000
const candidateTotalInView = ref(0)
const candidateCapped = ref(false)

// JOSM remote-control connection status (null = not checked yet)
const josmConnected = ref<boolean | null>(null)
const josmTesting = ref(false)
const josmHelpOpen = ref(false)

const checkJosm = async () => {
  josmTesting.value = true
  try {
    josmConnected.value = await testJosmConnection()
  } catch {
    josmConnected.value = false
  } finally {
    josmTesting.value = false
  }
}

// Open the layers panel and scroll a hint into view (used by the checklist).
const revealLayersPanel = () => {
  layersCollapsed.value = false
}

const zoomToWorkingLevel = () => {
  if (!map.value) return
  const view = map.value.getView()
  view.animate({ zoom: Math.max(16, view.getZoom() || 16), duration: 600 })
}

const dismissResults = () => {
  differenceState.value = 'idle'
  matchingStats.value = null
}

// Keyboard shortcuts: G = Get Difference, J = open in JOSM. Ignored while typing.
const handleKeydown = (e: KeyboardEvent) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

  const key = e.key.toLowerCase()
  if (key === 'g' && canCalculateDifference.value && !isCalculatingDifference.value) {
    e.preventDefault()
    calculateDifference()
  } else if (key === 'j' && canExportToJOSM.value) {
    e.preventDefault()
    exportToJOSM()
  }
}

const coveragePct = computed(() => {
  const s = matchingStats.value
  if (!s || !s.totalGrb) return 0
  return Math.round((s.matched / s.totalGrb) * 100)
})

// Source/combined modes are GRB-only; other sources are matched by geometry (see resolveMatchMode).
const effectiveMatchMode = computed(
  () => resolveMatchMode(matchMode.value, selectedSource.value === 'none' ? 'grb' : selectedSource.value).mode
)

// Short, human label for what produced the current results (which mode, freshness).
const matchSummary = computed(() => {
  const pct = Math.round(geometryThreshold.value * 100)
  const mode =
    effectiveMatchMode.value === 'source'
      ? 'Source tag'
      : effectiveMatchMode.value === 'both'
        ? `Geometry ${pct}% + source tag`
        : `Geometry ${pct}%`
  const freshness = useOverpass.value ? 'live Overpass' : 'OSM mirror'
  return `${mode} · ${freshness}`
})

// Computed property to check if JOSM export button should be enabled
const canExportToJOSM = computed(
  () =>
    // Check if there are candidate buildings
    candidateBuildingCount.value > 0
)

watch(
  () => selectedLocation,
  (loc) => {
    if (!loc || !map.value) return
    const coords = fromLonLat(loc.coordinates)
    map.value.getView().animate({
      center: coords,
      zoom: 16,
      duration: 1000
    })
  }
)

// Watch for match mode changes and refetch candidate buildings if they're already loaded
watch(matchMode, () => {
  if (candidateBuildingsLayerRef.value) {
    // Refetch candidate buildings with the new match mode
    calculateDifference()
  }
})

watch(geometryThreshold, () => {
  if ((matchMode.value === 'geometry' || matchMode.value === 'both') && candidateBuildingsLayerRef.value) {
    calculateDifference()
  }
})

watch(useOverpass, (live) => {
  if (!live) clearLiveOsmLayer()
  if (candidateBuildingsLayerRef.value) {
    calculateDifference()
  }
})

const setupMap = () => {
  if (!mapRef.value) return

  // Initialize map with composable
  const mapInstance = initializeMap(mapRef.value, {
    center: [4.3517, 50.8503],
    zoom: 8
  })

  // Update reactive values when map moves
  mapInstance.on('moveend', () => {
    if (!map.value) return
    const view = map.value.getView()
    const zoom = Math.round(view.getZoom() || 13)
    currentZoom.value = zoom
    const center = view.getCenter()
    if (center) {
      const [lon, lat] = toLonLat(center)
      if (lon !== undefined && lat !== undefined) currentCenter.value = [lon, lat]
    }

    // Handle visibility of building layers based on zoom
    handleZoomBasedLayerVisibility(zoom)
  })
}

const zoomIn = () => {
  if (!map.value) return
  const view = map.value.getView()
  view.animate({
    zoom: (view.getZoom() || 13) + 1,
    duration: 250
  })
}

const zoomOut = () => {
  if (!map.value) return
  const view = map.value.getView()
  view.animate({
    zoom: (view.getZoom() || 13) - 1,
    duration: 250
  })
}

const resetView = () => {
  if (!map.value) return
  map.value.getView().animate({
    center: fromLonLat([4.3517, 50.8503]),
    zoom: 8,
    duration: 1000
  })
}

// Handle visibility of building layers based on zoom level
const handleZoomBasedLayerVisibility = (zoom: number) => {
  if (!map.value) return

  const shouldShowBuildings = zoom >= 16

  // Only show/hide existing layers, don't auto-load
  if (osmBuildingsLayerRef.value) {
    osmBuildingsLayerRef.value.setVisible(
      shouldShowBuildings && overlayLayers.value.osmBuildings && !liveOsmLayerRef.value
    )
  }
  if (liveOsmLayerRef.value) {
    liveOsmLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.osmBuildings)
  }
  if (grbBuildingsLayerRef.value) {
    grbBuildingsLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.grbBuildings)
  }
  if (knwStructuresLayerRef.value) {
    knwStructuresLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.knwStructures)
  }
  if (piccBuildingsLayerRef.value) {
    piccBuildingsLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.piccBuildings)
  }
  if (urbisBuildingsLayerRef.value) {
    urbisBuildingsLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.urbisBuildings)
  }
}

// Handle Load GRB KNW structures using Vector Tiles
const handleLoadKNW = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    if (knwStructuresLayerRef.value) {
      map.value.removeLayer(knwStructuresLayerRef.value)
    }

    const knwTileSource = new VectorTileSource({
      format: new MVT(),
      url: candidateTileUrl('knw'),
      minZoom: 10,
      maxZoom: 18,
      attributions: '© GRB Kunstwerken'
    })

    const knwStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')

      let fillColor = hslVar('--layer-knw', 0.14)
      let strokeColor = hslVar('--layer-knw', 1)

      if (isHovered) {
        fillColor = hslVar('--layer-knw', 0.28)
        strokeColor = hslVar('--layer-knw-light', 1)
      }

      return new Style({
        fill: new Fill({ color: fillColor }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    const knwTileLayer = new VectorTileLayer({
      source: knwTileSource,
      style: knwStyleFunction,
      zIndex: 10,
      properties: {
        title: 'GRB Kunstwerken',
        type: 'overlay'
      }
    })

    knwStructuresLayerRef.value = knwTileLayer
    map.value.addLayer(knwTileLayer)
    knwTileLayer.setVisible(false)
  } catch (error) {
    console.error('Failed to load GRB kunstwerken:', error)
  }
}

// Read HSL CSS variable and return color string for OpenLayers
const hslVar = (name: string, alpha: number): string => {
  const hsl = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return `hsl(${hsl} / ${alpha})`
}

// Handle Load OSM Buildings using Vector Tiles from Martin
const handleLoadOSM = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing OSM buildings layer if present
    if (osmBuildingsLayerRef.value) {
      map.value.removeLayer(osmBuildingsLayerRef.value)
    }

    // Create vector tile source for OSM buildings
    const osmTileSource = new VectorTileSource({
      format: new MVT(),
      url: '/tiles/osm/osm_buildings/{z}/{x}/{y}',
      minZoom: 10,
      maxZoom: 18,
      attributions: '© OpenStreetMap contributors'
    })

    // Style function for OSM buildings
    const osmStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')
      const source = feature.get('source') || ''

      let fillColor = hslVar('--layer-osm', 0.15)
      let strokeColor = hslVar('--layer-osm', 1)

      if (source.includes('Gbg')) {
        fillColor = hslVar('--layer-osm-light', 0.15)
        strokeColor = hslVar('--layer-osm-light', 1)
      }

      if (isHovered) {
        fillColor = hslVar('--layer-osm', 0.3)
        strokeColor = hslVar('--layer-osm-light', 1)
      }

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    // Create vector tile layer
    const osmTileLayer = new VectorTileLayer({
      source: osmTileSource,
      style: osmStyleFunction,
      zIndex: 9,
      properties: {
        title: 'OSM Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map
    osmBuildingsLayerRef.value = osmTileLayer
    map.value.addLayer(osmTileLayer)

    // Update UI state
    overlayLayers.value.osmBuildings = true

    // Set initial visibility based on current zoom level
    const currentZoomLevel = Math.round(map.value.getView().getZoom() || 13)
    const shouldShow = currentZoomLevel >= 16 && overlayLayers.value.osmBuildings
    osmTileLayer.setVisible(shouldShow)
  } catch (error) {
    console.error('Failed to load OSM buildings:', error)
  }
}

// Handle Load GRB Buildings using Vector Tiles
const handleLoadGRB = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    isLoadingGRB.value = true

    // Remove existing GRB buildings layer if present
    if (grbBuildingsLayerRef.value) {
      map.value.removeLayer(grbBuildingsLayerRef.value)
    }

    // Create vector tile source for GRB buildings
    const grbTileSource = new VectorTileSource({
      format: new MVT(),
      url: candidateTileUrl('grb'),
      minZoom: 10,
      maxZoom: 18,
      attributions: '© GRB Buildings'
    })

    // Style function for GRB buildings
    const grbStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')
      const buildingType = feature.get('building_type')

      let fillColor = hslVar('--layer-grb', 0.15)
      if (buildingType === 'shed') {
        fillColor = hslVar('--layer-grb-dark', 0.15)
      }

      let strokeColor = hslVar('--layer-grb', 1)

      if (isHovered) {
        fillColor = hslVar('--layer-grb', 0.3)
        strokeColor = hslVar('--layer-grb-light', 1)
      }

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    // Create vector tile layer
    const grbTileLayer = new VectorTileLayer({
      source: grbTileSource,
      style: grbStyleFunction,
      zIndex: 10,
      properties: {
        title: 'GRB Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map (hidden by default — user toggles it on)
    grbBuildingsLayerRef.value = grbTileLayer
    map.value.addLayer(grbTileLayer)
    grbTileLayer.setVisible(false)
  } catch (error) {
    console.error('Failed to load GRB buildings:', error)
  } finally {
    isLoadingGRB.value = false
  }
}

// Handle Load PICC Buildings using Vector Tiles from Martin
const handleLoadPICC = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing PICC buildings layer if present
    if (piccBuildingsLayerRef.value) {
      map.value.removeLayer(piccBuildingsLayerRef.value)
    }

    // Create vector tile source for PICC buildings
    const piccTileSource = new VectorTileSource({
      format: new MVT(),
      url: candidateTileUrl('picc'),
      minZoom: 10,
      maxZoom: 18,
      attributions: '© PICC Wallonia'
    })

    // Style function for PICC buildings
    const piccStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')

      let fillColor = hslVar('--layer-picc', 0.15)
      let strokeColor = hslVar('--layer-picc', 1)

      if (isHovered) {
        fillColor = hslVar('--layer-picc', 0.3)
        strokeColor = hslVar('--layer-picc-light', 1)
      }

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    // Create vector tile layer
    const piccTileLayer = new VectorTileLayer({
      source: piccTileSource,
      style: piccStyleFunction,
      zIndex: 11,
      properties: {
        title: 'PICC Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map (hidden by default — user toggles it on)
    piccBuildingsLayerRef.value = piccTileLayer
    map.value.addLayer(piccTileLayer)
    piccTileLayer.setVisible(false)
  } catch (error) {
    console.error('Failed to load PICC buildings:', error)
  }
}

// Handle Load Urbis Buildings using Vector Tiles from Martin
const handleLoadUrbis = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing Urbis buildings layer if present
    if (urbisBuildingsLayerRef.value) {
      map.value.removeLayer(urbisBuildingsLayerRef.value)
    }

    // Create vector tile source for Urbis buildings
    const urbisTileSource = new VectorTileSource({
      format: new MVT(),
      url: candidateTileUrl('urbis'),
      minZoom: 10,
      maxZoom: 18,
      attributions: '© UrbIS Brussels'
    })

    // Style function for Urbis buildings
    const urbisStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')

      let fillColor = hslVar('--layer-urbis', 0.15)
      let strokeColor = hslVar('--layer-urbis', 1)

      if (isHovered) {
        fillColor = hslVar('--layer-urbis', 0.3)
        strokeColor = hslVar('--layer-urbis-light', 1)
      }

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    // Create vector tile layer
    const urbisTileLayer = new VectorTileLayer({
      source: urbisTileSource,
      style: urbisStyleFunction,
      zIndex: 12,
      properties: {
        title: 'Urbis Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map (hidden by default — user toggles it on)
    urbisBuildingsLayerRef.value = urbisTileLayer
    map.value.addLayer(urbisTileLayer)
    urbisTileLayer.setVisible(false)
  } catch (error) {
    console.error('Failed to load Urbis buildings:', error)
  }
}

// Layer toggle functions (kept for layer panel compatibility)

const toggleCandidateBuildings = (visible: boolean) => {
  overlayLayers.value.candidateBuildings = visible

  // Toggle visibility of candidate buildings layer
  if (candidateBuildingsLayerRef.value) {
    candidateBuildingsLayerRef.value.setVisible(visible)
  }
}

const toggleOsmBuildings = (visible: boolean) => {
  overlayLayers.value.osmBuildings = visible

  // Toggle visibility of OSM buildings layer
  if (osmBuildingsLayerRef.value) {
    osmBuildingsLayerRef.value.setVisible(visible && !liveOsmLayerRef.value)
  }
  if (liveOsmLayerRef.value) {
    liveOsmLayerRef.value.setVisible(visible)
  }
}

const toggleGrbBuildings = (visible: boolean) => {
  overlayLayers.value.grbBuildings = visible
  const shouldShow = visible && currentZoom.value >= 16

  if (grbBuildingsLayerRef.value) {
    grbBuildingsLayerRef.value.setVisible(shouldShow)
  }

  // GRB, PICC, and Urbis are mutually exclusive
  if (visible) {
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      if (piccBuildingsLayerRef.value) piccBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      if (urbisBuildingsLayerRef.value) urbisBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      if (knwStructuresLayerRef.value) knwStructuresLayerRef.value.setVisible(false)
    }
  }
}

const toggleKnwStructures = (visible: boolean) => {
  overlayLayers.value.knwStructures = visible
  const shouldShow = visible && currentZoom.value >= 16

  if (knwStructuresLayerRef.value) {
    knwStructuresLayerRef.value.setVisible(shouldShow)
  }

  if (visible) {
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      if (piccBuildingsLayerRef.value) piccBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      if (urbisBuildingsLayerRef.value) urbisBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      if (grbBuildingsLayerRef.value) grbBuildingsLayerRef.value.setVisible(false)
    }
  }
}

const togglePiccBuildings = (visible: boolean) => {
  overlayLayers.value.piccBuildings = visible
  const shouldShow = visible && currentZoom.value >= 16

  if (piccBuildingsLayerRef.value) {
    piccBuildingsLayerRef.value.setVisible(shouldShow)
  }

  // GRB, PICC, and Urbis are mutually exclusive
  if (visible) {
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      if (grbBuildingsLayerRef.value) grbBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      if (knwStructuresLayerRef.value) knwStructuresLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      if (urbisBuildingsLayerRef.value) urbisBuildingsLayerRef.value.setVisible(false)
    }
  }
}

const toggleUrbisBuildings = (visible: boolean) => {
  overlayLayers.value.urbisBuildings = visible
  const shouldShow = visible && currentZoom.value >= 16

  if (urbisBuildingsLayerRef.value) {
    urbisBuildingsLayerRef.value.setVisible(shouldShow)
  }

  // GRB, PICC, and Urbis are mutually exclusive
  if (visible) {
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      if (grbBuildingsLayerRef.value) grbBuildingsLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      if (knwStructuresLayerRef.value) knwStructuresLayerRef.value.setVisible(false)
    }
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      if (piccBuildingsLayerRef.value) piccBuildingsLayerRef.value.setVisible(false)
    }
  }
}

// Source dataset is single-select (GRB / KNW / PICC / Urbis are mutually exclusive).
// Reflect the active one and route clicks through the existing toggle handlers, which
// already disable the others.
type SourceKind = 'grb' | 'knw' | 'picc' | 'urbis'
const selectedSource = computed<SourceKind | 'none'>(() => {
  if (overlayLayers.value.grbBuildings) return 'grb'
  if (overlayLayers.value.knwStructures) return 'knw'
  if (overlayLayers.value.piccBuildings) return 'picc'
  if (overlayLayers.value.urbisBuildings) return 'urbis'
  return 'none'
})

const sourceOptions: { key: SourceKind; label: string; varName: string }[] = [
  { key: 'grb', label: 'GRB', varName: '--layer-grb' },
  { key: 'knw', label: 'KNW', varName: '--layer-knw' },
  { key: 'picc', label: 'PICC', varName: '--layer-picc' },
  { key: 'urbis', label: 'Urbis', varName: '--layer-urbis' }
]

// Import dates of the official datasets, shown as a tooltip on the source buttons (Issue #59)
const dataDates = ref<Partial<Record<SourceKind, string | null>>>({})
const dataDateTitle = (src: SourceKind, label: string) => {
  const iso = dataDates.value[src]
  if (!iso) return label
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return label
  return `${label} data imported on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}
const loadDataDates = async () => {
  try {
    dataDates.value = await $fetch<Record<SourceKind, string | null>>('/api/meta/data-dates')
  } catch (error) {
    console.warn('Failed to load data dates:', error)
  }
}

const selectSource = (src: SourceKind) => {
  // Clicking the active dataset turns it off; otherwise switch to it.
  const turnOn = selectedSource.value !== src
  if (src === 'grb') toggleGrbBuildings(turnOn)
  else if (src === 'knw') toggleKnwStructures(turnOn)
  else if (src === 'picc') togglePiccBuildings(turnOn)
  else toggleUrbisBuildings(turnOn)
}

// Helper function to calculate polygon centroid
const getPolygonCentroid = (coords: [number, number][]): [number, number] => {
  if (!coords || coords.length === 0) return [0, 0]
  let x = 0,
    y = 0
  for (const coord of coords) {
    x += coord[0]
    y += coord[1]
  }
  return [x / coords.length, y / coords.length]
}

// Helper function to check if a point is inside a polygon (ray casting algorithm)
const pointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue
    const [xi, yi] = pi
    const [xj, yj] = pj

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

// Helper function to check if two polygons overlap significantly
const polygonsOverlap = (grbCoords: [number, number][], osmCoords: [number, number][]): boolean => {
  // Check if any GRB vertex is inside OSM polygon
  for (const coord of grbCoords) {
    if (pointInPolygon(coord, osmCoords)) {
      return true
    }
  }

  // Check if any OSM vertex is inside GRB polygon
  for (const coord of osmCoords) {
    if (pointInPolygon(coord, grbCoords)) {
      return true
    }
  }

  return false
}

// Helper function to check if a GRB feature has a matching OSM feature
const hasMatchingOSMFeature = (grbFeature: any, osmFeatures: any[]): boolean => {
  const grbGeom = grbFeature.geometry
  if (!grbGeom || !grbGeom.coordinates || grbGeom.type !== 'Polygon') return false

  const [grbCoords] = grbGeom.coordinates // exterior ring

  // Check if any OSM feature overlaps with this GRB feature
  for (const osmFeature of osmFeatures) {
    const osmSource = osmFeature.properties?.source || ''

    // Skip OSM features that already have GRB as source
    if (osmSource.includes('Gbg')) {
      continue
    }

    // Check OSM geometry
    const osmGeom = osmFeature.geometry
    if (!osmGeom || !osmGeom.coordinates || osmGeom.type !== 'Polygon') continue

    const [osmCoords] = osmGeom.coordinates // exterior ring

    // Check if polygons overlap
    if (polygonsOverlap(grbCoords, osmCoords)) {
      return true
    }
  }

  return false
}

// Helper function to get bounding box of a polygon
const getBoundingBox = (coords: [number, number][]): [number, number, number, number] => {
  if (!coords || coords.length === 0) return [0, 0, 0, 0]
  let maxX = -Infinity,
    maxY = -Infinity,
    minX = Infinity,
    minY = Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

// Helper function to check if two bounding boxes overlap or are very close
const boundingBoxesIntersect = (
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number],
  tolerance = 5
): boolean =>
  // tolerance in map units (meters in EPSG:31370)
  !(
    bbox1[2] + tolerance < bbox2[0] ||
    bbox1[0] - tolerance > bbox2[2] ||
    bbox1[3] + tolerance < bbox2[1] ||
    bbox1[1] - tolerance > bbox2[3]
  )

// Helper function to merge polygon fragments properly
// Combines all coordinates from fragments and reconstructs the polygon
const mergePolygonFragments = (polygons: [number, number][][]): [number, number][] => {
  const [firstPolygon] = polygons
  if (!firstPolygon) return []
  if (polygons.length === 1) return firstPolygon

  // For 2+ fragments, combine all unique coordinates and reconstruct
  // The key insight: vector tile fragments overlap at boundaries,
  // so combining all points gives us the complete building outline
  const allCoords: [number, number][] = []

  for (const polygon of polygons) {
    allCoords.push(...polygon)
  }

  // Remove duplicate/very close coordinates (within 0.01 units)
  const uniqueCoords: [number, number][] = []
  for (const coord of allCoords) {
    const isDuplicate = uniqueCoords.some(
      (existing) => Math.abs(existing[0] - coord[0]) < 0.01 && Math.abs(existing[1] - coord[1]) < 0.01
    )
    if (!isDuplicate) {
      uniqueCoords.push(coord)
    }
  }

  if (uniqueCoords.length < 3) return firstPolygon

  // Use Concave Hull (radial sweep) to order points while preserving concavity
  // This is more accurate than angle-from-centroid for concave shapes
  const ordered = concaveHull(uniqueCoords)

  return ordered.length >= 3 ? ordered : firstPolygon
}

// Concave hull algorithm - orders points to form a polygon preserving concavity
const concaveHull = (points: [number, number][]): [number, number][] => {
  if (points.length <= 3) return points

  // Find the leftmost point
  let leftmostIdx = 0
  let leftmostX = Infinity
  for (const [i, [x]] of points.entries()) {
    if (x < leftmostX) {
      leftmostX = x
      leftmostIdx = i
    }
  }

  // Gift wrapping (Jarvis march) algorithm adapted for concave hulls
  const hull: [number, number][] = []
  let current = leftmostIdx
  let previous = -1

  do {
    const curr = points[current]
    if (!curr) break
    hull.push(curr)
    let next = 0

    for (const [i, candidate] of points.entries()) {
      if (i === current || i === previous) continue

      const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

      const nxt = points[next]

      if (next === previous || !nxt) {
        next = i
      } else {
        const crossProduct = cross(curr, nxt, candidate)
        if (crossProduct > 0) {
          next = i
        }
      }
    }

    previous = current
    current = next
  } while (current !== leftmostIdx && current !== 0 && hull.length < points.length + 5)

  return hull
}

// Merge fragmented building features that span multiple tiles
// Strategy: Group by ID first (matching fragments), then merge by combining coordinates
const mergeFragmentedBuildings = (features: any[]): any[] => {
  if (features.length <= 1) return features

  const merged: any[] = []
  const processed = new Set<number>()
  const tolerance = 5 // meters in EPSG:31370 - tolerance for considering features as fragments of same building

  for (let i = 0; i < features.length; i++) {
    if (processed.has(i)) continue

    const feature = features[i]
    const coords = feature.geometry?.coordinates?.[0]
    if (!coords) {
      merged.push(feature)
      processed.add(i)
      continue
    }

    // Find all features that should be merged with this one
    const featureId = feature.properties?.id
    const bbox1 = getBoundingBox(coords)
    const fragmentsToMerge = [{ coords, properties: feature.properties }]

    for (let j = i + 1; j < features.length; j++) {
      if (processed.has(j)) continue

      const otherFeature = features[j]
      const otherCoords = otherFeature.geometry?.coordinates?.[0]
      if (!otherCoords) continue

      const otherFeatureId = otherFeature.properties?.id

      // First priority: merge by ID if both have IDs and they match
      if (featureId && otherFeatureId && featureId === otherFeatureId) {
        fragmentsToMerge.push({ coords: otherCoords, properties: otherFeature.properties })
        processed.add(j)
      } else if (!featureId && !otherFeatureId) {
        // If neither has ID, merge by proximity
        const bbox2 = getBoundingBox(otherCoords)
        if (boundingBoxesIntersect(bbox1, bbox2, tolerance)) {
          fragmentsToMerge.push({ coords: otherCoords, properties: otherFeature.properties })
          processed.add(j)
        }
      }
      // Don't merge if one has ID and the other doesn't, or if IDs don't match
    }

    processed.add(i)

    // Merge all found fragments
    if (fragmentsToMerge.length > 1) {
      const coordsToMerge = fragmentsToMerge.map((f) => f.coords)
      // Merge all fragments by combining coordinates and reconstructing polygon
      const mergedCoords = mergePolygonFragments(coordsToMerge)
      merged.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [mergedCoords]
        },
        properties: feature.properties || {}
      })
    } else {
      merged.push(feature)
    }
  }

  return merged
}

// Calculate difference between source (GRB/PICC) and OSM buildings and display them
// Issue #9: drop the live OSM layer and show the tile layer (Postgres mirror) again.
const clearLiveOsmLayer = () => {
  if (liveOsmLayerRef.value && map.value) map.value.removeLayer(liveOsmLayerRef.value)
  liveOsmLayerRef.value = null
  if (osmBuildingsLayerRef.value) {
    osmBuildingsLayerRef.value.setVisible(
      overlayLayers.value.osmBuildings && Math.round(map.value?.getView().getZoom() || 0) >= 16
    )
  }
}

// Issue #9: draw the fresh Overpass buildings for the view so the map matches the difference results.
const refreshLiveOsmLayer = async (bounds: (number | undefined)[]) => {
  if (!map.value) return
  const geojson: any = await $fetch('/api/buildings/osm-live', { method: 'POST', body: { bounds } })

  const { default: VectorLayer } = await import('ol/layer/Vector')
  const { default: VectorSource } = await import('ol/source/Vector')
  const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')

  if (liveOsmLayerRef.value) map.value.removeLayer(liveOsmLayerRef.value)

  const features = new GeoJSONFormat().readFeatures(geojson, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  })
  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    style: new Style({
      fill: new Fill({ color: hslVar('--layer-osm', 0.15) }),
      stroke: new Stroke({ color: hslVar('--layer-osm', 1), width: 2 })
    }),
    zIndex: 9,
    visible: overlayLayers.value.osmBuildings,
    properties: { title: 'OSM Buildings (live)', type: 'overlay' }
  })
  liveOsmLayerRef.value = layer
  map.value.addLayer(layer)
  osmBuildingsLayerRef.value?.setVisible(false)
}

// Prefer the API's message (e.g. Overpass rate limit) over the generic fetch error text.
const apiErrorMessage = (error: any): string =>
  error?.data?.statusMessage || error?.statusMessage || (error instanceof Error ? error.message : String(error))

const calculateDifference = async () => {
  if (!map.value) return

  // Determine which data source is active (GRB, PICC, or Urbis)
  const grbActive = overlayLayers.value.grbBuildings && grbBuildingsLayerRef.value
  const knwActive = overlayLayers.value.knwStructures && knwStructuresLayerRef.value
  const piccActive = overlayLayers.value.piccBuildings && piccBuildingsLayerRef.value
  const urbisActive = overlayLayers.value.urbisBuildings && urbisBuildingsLayerRef.value
  const dataSource = urbisActive ? 'urbis' : piccActive ? 'picc' : knwActive ? 'knw' : 'grb'

  // Check if OSM layer and at least one source layer are loaded
  if (!osmBuildingsLayerRef.value || (!grbActive && !knwActive && !piccActive && !urbisActive)) {
    toast.warning('Layers required', 'Please enable OSM Buildings and a source layer (GRB, KNW, PICC, or Urbis) first.')
    return
  }

  // Check zoom level
  const view = map.value.getView()
  const zoom = view.getZoom() || 13
  const roundedZoom = Math.round(zoom)
  if (roundedZoom < 16) {
    toast.warning('Zoom in required', `Please zoom in to at least level 16. Current zoom: ${roundedZoom}`)
    return
  }

  // Check if OSM layer is visible
  if (!overlayLayers.value.osmBuildings) {
    toast.warning('Layer required', 'Please enable the OSM Buildings layer first.')
    return
  }

  // Set loading state
  isCalculatingDifference.value = true
  differenceState.value = 'loading'
  differenceError.value = ''

  try {
    // Get map extent in Web Mercator (EPSG:3857)
    const mapExtent = map.value.getView().calculateExtent(map.value.getSize())

    // Send Web Mercator bounds to API - PostGIS will handle transformation
    const bounds = [mapExtent[0], mapExtent[1], mapExtent[2], mapExtent[3]]

    // Live mode: refresh the OSM layer from Overpass too (non-fatal; the difference call reports errors)
    if (useOverpass.value) {
      await refreshLiveOsmLayer(bounds).catch((e) => console.warn('Live OSM layer failed:', e))
    } else {
      clearLiveOsmLayer()
    }

    // Call backend API to calculate difference
    const response = await $fetch('/api/buildings/difference', {
      method: 'POST',
      body: {
        bounds,
        matchMode: resolveMatchMode(matchMode.value, dataSource).mode,
        dataSource,
        geometryThreshold: geometryThreshold.value,
        useOverpass: useOverpass.value,
        contract: CANDIDATES_CONTRACT
      }
    })

    const candidateGeoJSON = response as any

    if (!candidateGeoJSON || candidateGeoJSON.features.length === 0) {
      // Persistent empty state in the results panel rather than a disappearing toast.
      differenceState.value = 'empty'

      // Remove existing candidate buildings layer if present
      if (candidateBuildingsLayerRef.value) {
        map.value.removeLayer(candidateBuildingsLayerRef.value)
        candidateBuildingsLayerRef.value = null
      }

      matchingStats.value = null
      candidateBuildingCount.value = 0
      candidateCapped.value = false
      candidateTotalInView.value = 0
      originalCandidateFeatures.value = []
      return
    }

    // Soft cap on how many candidates we render and export at once. Mass imports need
    // review; loading tens of thousands of features also strains the browser. The true
    // count is still reported in the stats; the note tells the user what is loaded.
    const totalCandidates = candidateGeoJSON.features.length
    candidateTotalInView.value = totalCandidates
    candidateCapped.value = totalCandidates > CANDIDATE_RENDER_CAP
    if (candidateCapped.value) {
      candidateGeoJSON.features = candidateGeoJSON.features.slice(0, CANDIDATE_RENDER_CAP)
    }

    // Stamp the source kind on each candidate so the review tooltip and JOSM export
    // know what they are looking at (the candidate layer is a single OL layer).
    const sourceKind =
      dataSource === 'knw' ? 'knw' : dataSource === 'picc' ? 'picc' : dataSource === 'urbis' ? 'urbis' : 'grb'
    for (const f of candidateGeoJSON.features) {
      f.properties = f.properties || {}
      f.properties._layer_type = sourceKind
    }

    // Update matching stats (unmatched reflects the true count missing from OSM)
    const stats = (candidateGeoJSON as any).stats || {}
    matchingStats.value = {
      totalGrb: stats.totalGrb || totalCandidates,
      totalOsm: stats.totalOsm || 0,
      matched: (stats.totalGrb || 0) - totalCandidates,
      unmatched: totalCandidates
    }

    // Candidate count reflects what is actually loaded/exportable (post-cap)
    candidateBuildingCount.value = candidateGeoJSON.features.length

    // Store original features for simplification
    originalCandidateFeatures.value = candidateGeoJSON.features

    // Remove existing candidate buildings layer if present
    if (candidateBuildingsLayerRef.value) {
      map.value.removeLayer(candidateBuildingsLayerRef.value)
    }

    // Import OpenLayers modules
    const { default: VectorLayer } = await import('ol/layer/Vector')
    const { default: VectorSource } = await import('ol/source/Vector')
    const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')

    console.log('Candidate features loaded:', candidateGeoJSON.features.length)

    // Parse GeoJSON and create source
    const geoJsonFormat = new GeoJSONFormat()
    const features = geoJsonFormat.readFeatures(candidateGeoJSON, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    })

    const candidateSource = new VectorSource({ features })

    // Style function for candidate buildings
    const candidateStyleFunction = () =>
      new Style({
        fill: new Fill({
          color: hslVar('--layer-candidate', 0.35)
        }),
        stroke: new Stroke({
          color: hslVar('--layer-candidate', 1),
          width: 2
        })
      })

    // Create vector layer for candidate buildings
    const candidateLayer = new VectorLayer({
      source: candidateSource,
      style: candidateStyleFunction,
      zIndex: 11,
      properties: {
        title: 'Candidate Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map
    candidateBuildingsLayerRef.value = candidateLayer
    map.value.addLayer(candidateLayer)

    // Enable candidate buildings layer
    overlayLayers.value.candidateBuildings = true
    differenceState.value = 'success'
  } catch (error) {
    console.error('Error calculating difference:', error)
    differenceState.value = 'error'
    differenceError.value = apiErrorMessage(error)
  } finally {
    // Reset loading state
    isCalculatingDifference.value = false
  }
}

const exportToJOSM = async () => {
  if (!map.value) return

  // Check if we have candidate buildings data
  if (originalCandidateFeatures.value.length === 0) {
    toast.warning('No candidates', 'Please click "Get Difference" first to calculate candidate buildings.')
    return
  }

  try {
    // Check JOSM connection first
    josmTesting.value = true
    const isConnected = await testJosmConnection()
    josmConnected.value = isConnected
    josmTesting.value = false
    if (!isConnected) {
      // Open the setup dialog instead of cramming instructions into a toast.
      josmHelpOpen.value = true
      return
    }

    // Use ALL features from the original API response (not just visible ones)
    // This ensures we export everything from "Get Difference", not just what's in viewport
    const allFeatures = originalCandidateFeatures.value

    if (allFeatures.length === 0) {
      toast.warning('Nothing to export', 'No buildings available to export.')
      return
    }

    console.log(`Exporting ${allFeatures.length} candidate buildings to JOSM`)

    // Export to JOSM - ALL features from the candidate layer
    const hasKnwCandidates = allFeatures.some((feature: any) => {
      const layerType = String(feature?.properties?._layer_type || '').toLowerCase()
      const entity = String(feature?.properties?.entity || '').toLowerCase()
      return layerType === 'knw' || entity === 'knw'
    })

    const result = await exportLayerToJosm(
      allFeatures,
      hasKnwCandidates ? 'GRB Candidate Structures (KNW)' : 'GRB Candidate Buildings',
      {
        includeMeta: false,
        simplify: simplifyOnExport.value,
        simplifyPercent: simplifyPercent.value,
        uploadToBackend: false
      }
    )

    console.log('✅ Export successful')
    toast.success(
      'Exported to JOSM',
      `${result.featureCount} building${result.featureCount === 1 ? '' : 's'} loaded as a new layer in JOSM.`
    )
  } catch (error: any) {
    console.error('Error exporting candidate buildings to JOSM:', error)
    josmTesting.value = false
    toast.error('JOSM export failed', error.message || 'Could not send data to JOSM.')
  }
}

// Remove a specific feature from the clicked features array
const removeFeature = (index: number) => {
  clickedFeatures.value.splice(index, 1)

  // If no features left, close the panel
  if (clickedFeatures.value.length === 0) {
    closeTooltip()
  }
}

// Close tooltip function
const closeTooltip = () => {
  isTooltipSticky.value = false
  clickedFeatures.value = []
  hoveredFeatures.value = []
  activeFeatureIndex.value = 0
}

// Helper function to parse PostgreSQL array format {item1,item2} to JS array
const parsePostgresArray = (value: string[] | string | undefined): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value

  // Handle PostgreSQL array format: {item1,item2,"item with spaces"}
  const str = String(value).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    const inner = str.slice(1, -1)
    if (inner === '') return []

    // Split by comma, but respect quoted strings
    const items: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of inner) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        items.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    if (current) items.push(current.trim())

    return items.map((item) => item.replace(/^"|"$/g, ''))
  }

  // Handle '; '-separated strings (STRING_AGG with '; ' separator, e.g. addresses column)
  if (str.includes('; ')) {
    return str
      .split('; ')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return [str]
}

// Group addresses that share the same base address, collapsing box numbers
// e.g. ["Boekfos 49, 1730 Asse", "Boekfos 49 bus 1, 1730 Asse", "Boekfos 49 bus 2, 1730 Asse"]
//   → [{ base: "Boekfos 49, 1730 Asse", boxes: ["1", "2"] }]
interface GroupedAddress {
  base: string
  boxes: string[]
}
const groupAddresses = (addresses: string[]): GroupedAddress[] => {
  // Pattern: "<street> <number> bus <box>, <postcode> <city>"
  const busPattern = /^(.+?)\s+bus\s+(.+?),\s*(.+)$/i
  const groups = new Map<string, string[]>()
  const order: string[] = []

  for (const addr of addresses) {
    const [, street, box, locality] = addr.match(busPattern) ?? []
    if (street && box && locality) {
      const base = `${street}, ${locality}`
      if (!groups.has(base)) {
        groups.set(base, [])
        order.push(base)
      }
      groups.get(base)!.push(box)
    } else {
      // No bus number — standalone address
      if (!groups.has(addr)) {
        groups.set(addr, [])
        order.push(addr)
      }
    }
  }

  // Sort box numbers naturally (1, 2, 3, ... 10, 11 instead of 1, 10, 11, 2)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  return order.map((base) => ({
    base,
    boxes: groups.get(base)!.sort(collator.compare)
  }))
}

// Helper to parse semicolon-separated lists from PICC matview
const parseSemicolonList = (value: string | undefined): string[] => {
  if (!value) return []
  return value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

// Helper to format PICC dates to yyyy-mm-dd
const formatPiccDate = (value: string | undefined): string => {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (isNaN(date.getTime())) return value
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  } catch {
    return value
  }
}

// Helper function to format area
const formatArea = (area: number): string => {
  if (!area) return '—'
  if (area >= 10000) {
    return `${(area / 10000).toFixed(2)} ha`
  }
  return `${area.toFixed(2)} m²`
}

// Helper function to translate GRB building types
const formatGRBBuildingType = (type: string | undefined): string => {
  if (!type) return 'Building'

  const translations: Record<string, string> = {
    hoofdgebouw: 'Main Building',
    bijgebouw: 'Outbuilding',
    afdak: 'Shelter',
    garage: 'Garage',
    berging: 'Storage',
    serre: 'Conservatory',
    'ingezonken garagetoegang': 'Sunken Garage Entrance',
    verdieping: 'Upper Floor',
    trap: 'Staircase',
    'zichtbare onderkeldering': 'Visible Basement',
    'gebouw afgezoomd met virtuele gevels': 'Building with Virtual Facades',
    'verheven garagetoegang': 'Elevated Garage Entrance',
    loopbrug: 'Walkway'
  }

  return translations[type.toLowerCase()] || type
}

// Helper function to translate GRB origin labels (Dutch to English)
const formatOriginLabel = (label: string | undefined): string => {
  if (!label) return ''
  const translations: Record<string, string> = {
    terreinbezoek: 'Field Survey',
    'as-built plan': 'As-Built Plan',
    'gemeentelijk as-built plan': 'Municipal As-Built Plan',
    fotogrammetrisch: 'Photogrammetry',
    luchtfoto: 'Aerial Photo',
    gedigitaliseerd: 'Digitized',
    'niet gekend': 'Unknown',
    andere: 'Other'
  }
  return translations[label.toLowerCase()] || label
}

// Group OSM properties into address, source:geometry, and other
const getGroupedOsmProperties = (
  feature: any
): { address: [string, any][]; source: [string, any][]; other: [string, any][] } => {
  const all = getDisplayableProperties(feature)
  const address: [string, any][] = []
  const source: [string, any][] = []
  const other: [string, any][] = []

  for (const [key, value] of all) {
    if (key.startsWith('addr:') || key.startsWith('addr_')) {
      address.push([key, value])
    } else if (key.startsWith('source:geometry:') || key === 'source:geometry') {
      source.push([key, value])
    } else {
      other.push([key, value])
    }
  }

  return { address, source, other }
}

// Helper function to sort features - GRB first, then OSM
// Uses function declaration (not const arrow) so it's hoisted above computed() calls that reference it
function sortFeatures(features: any[]): any[] {
  return [...features].sort((a, b) => {
    const weight = (layerType: string) => {
      if (layerType === 'grb') return 0
      if (layerType === 'knw') return 1
      if (layerType === 'picc') return 2
      if (layerType === 'urbis') return 3
      if (layerType === 'osm') return 4
      return 5
    }
    return weight(a._layer_type) - weight(b._layer_type)
  })
}

const setMapCursor = (cursor: string) => {
  const target = map.value?.getTargetElement()
  if (target) target.style.cursor = cursor
}

// Helper function to parse PostgreSQL hstore tags format
const parseHstoreTags = (tagsString: string): Record<string, string> => {
  const tags: Record<string, string> = {}

  // Parse hstore format: "key"=>"value", "key2"=>"value2"
  const regex = /"([^"]+)"=>"([^"]*)"/g
  let match

  while ((match = regex.exec(tagsString)) !== null) {
    const [, key, value = ''] = match
    if (key) tags[key] = value
  }

  return tags
}

// Property mapping for GRB features (Dutch to English)
const grbPropertyMapping: Record<string, string | null> = {
  // Map to English
  BEGINDATUM: 'begin_date',
  VERSDATUM: 'version_date',
  LBLBGNINV: 'source_inventory_label',
  BGNINV: 'source_inventory',

  // Keep important fields
  source: 'source',
  source_dataset: 'source_dataset',
  source_geometry: 'source_geometry',
  source_geometry_date: 'source_geometry_date',
  source_geometry_entity: 'source_geometry_entity',
  postal_code: 'postal_code',
  building_type: 'building_type',

  // Filter out duplicates and noise
  'begin date': null,
  'version date': null,
  'source inventory': null,
  'source inventory label': null,
  'imported at': null,
  'updated at': null,
  source_geometry_version: null,
  importedAt: null,
  updatedAt: null
}

// Property display names (for formatting)
const propertyDisplayNames: Record<string, string> = {
  begin_date: 'Begin Date',
  version_date: 'Version Date',
  source_inventory: 'Inventory',
  source_inventory_label: 'Inventory Label',
  source_dataset: 'Dataset',
  source_geometry: 'Geometry Source',
  source_geometry_date: 'Geometry Date',
  source_geometry_entity: 'Entity',
  postal_code: 'Postal Code',
  building_type: 'Building Type',
  source: 'Source',
  name: 'Name',
  addr_street: 'Street',
  addr_housenumber: 'House Number',
  building: 'Building'
}

// Helper functions for tooltip display
const getDisplayableProperties = (feature: any) => {
  if (!feature) return []

  const isGrb = feature._layer_type === 'grb' || feature._layer_type === 'knw'
  const isOsm = feature._layer_type === 'osm'

  // Properties to exclude from display (internal or already shown)
  const excludedProps = [
    'geometry',
    'osm_id',
    'osm_type',
    'hovered',
    'id',
    'grbid',
    '_layer_type',
    'tags',
    'layer',
    'extent',
    'type'
  ]

  const properties: [string, any][] = []

  // First, add all regular properties (including source)
  Object.entries(feature)
    .filter(
      ([key, value]) =>
        // Exclude internal properties and empty values
        !excludedProps.includes(key) && value !== null && value !== undefined && value !== ''
    )
    .forEach(([key, value]) => {
      // Apply GRB mapping if it's a GRB feature
      if (isGrb && Object.hasOwn(grbPropertyMapping, key)) {
        const mappedKey = grbPropertyMapping[key]
        if (typeof mappedKey === 'string') {
          properties.push([mappedKey, value])
        }
        // If mapped to null, skip this property
      } else if (!isGrb || !Object.keys(grbPropertyMapping).some((k) => k.toLowerCase() === key.toLowerCase())) {
        // For OSM features or unmapped GRB properties, include them
        properties.push([key, value])
      }
    })

  // Parse and add tags if they exist (PostgreSQL hstore format or JSONB object)
  if (feature.tags) {
    let parsedTags: any = {}

    if (typeof feature.tags === 'string') {
      // Parse hstore string format
      parsedTags = parseHstoreTags(feature.tags)
    } else if (typeof feature.tags === 'object' && feature.tags !== null) {
      // Already an object (JSONB from vector tiles)
      parsedTags = feature.tags
    }

    // For OSM features, show all tags
    Object.entries(parsedTags)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .forEach(([key, value]) => {
        properties.push([key, value])
      })
  }

  // Sort alphabetically
  const sorted = properties.sort(([a], [b]) => a.localeCompare(b))

  // Remove duplicates based on actual key names and formatted names
  const seenKeys = new Set<string>()
  const seenFormattedKeys = new Set<string>()
  const uniqueProperties: [string, any][] = []

  for (const [key, value] of sorted) {
    const normalizedKey = key.toLowerCase()
    const formattedKey = formatPropertyKey(key)

    if (!seenKeys.has(normalizedKey) && !seenFormattedKeys.has(formattedKey)) {
      seenKeys.add(normalizedKey)
      seenFormattedKeys.add(formattedKey)
      uniqueProperties.push([key, value])
    }
  }

  return uniqueProperties
}

const formatPropertyKey = (key: string) => {
  // Check if we have a custom display name
  if (propertyDisplayNames[key]) {
    return propertyDisplayNames[key]
  }

  // Convert underscores to spaces and handle special cases
  return key
    .replace(/_/g, ' ')
    .replace(/:/g, ' ')
    .replace(/addr /g, '')
    .replace(/building /g, '')
    .trim()
}

// Helper to format a valid Date as a localized string
const formatDateValue = (date: Date, includeTime: boolean): string => {
  if (includeTime) {
    return new Intl.DateTimeFormat('nl-BE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  }
  return new Intl.DateTimeFormat('nl-BE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

const formatPropertyValue = (value: any): string => {
  if (value === null || value === undefined) {
    return ''
  }

  // Try to parse as date/datetime
  if (typeof value === 'string') {
    // Check if it looks like a date (YYYY-MM-DD or ISO datetime)
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch) {
      try {
        const date = new Date(value)

        // Check if it's a valid date
        if (!isNaN(date.getTime())) {
          const hasTime = value.includes('T') || /\d{2}:\d{2}/.test(value)
          return formatDateValue(date, hasTime)
        }
      } catch {
        // If parsing fails, return original value
      }
    }
  }

  return String(value)
}

// Setup hover interaction for building features
const setupHoverInteraction = () => {
  if (!map.value) return

  let currentHoveredFeatureObj: any = null
  const hoverTimeout: any = null
  let debounceTimeout: any = null

  // Add click interaction for sticky tooltip
  map.value.on('click', (evt) => {
    if (!map.value) return

    const pixel = map.value.getEventPixel(evt.originalEvent)

    const foundFeatures: any[] = []
    map.value.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => {
        if (
          layer === osmBuildingsLayerRef.value ||
          layer === grbBuildingsLayerRef.value ||
          layer === knwStructuresLayerRef.value ||
          layer === piccBuildingsLayerRef.value ||
          layer === urbisBuildingsLayerRef.value ||
          layer === candidateBuildingsLayerRef.value
        ) {
          // Get properties for clicked feature
          let properties: any
          try {
            properties = feature.getProperties()
          } catch (error) {
            console.warn('Error getting clicked feature properties:', error)
            properties = {}
          }

          // Extract feature ID and add it to properties
          const featureId = feature.getId() ?? null
          if (featureId) {
            if (layer === osmBuildingsLayerRef.value) {
              properties.osm_id = featureId
            } else {
              properties.id = featureId
            }
          }

          // Add layer type to distinguish OSM from GRB/PICC features
          properties._layer_type =
            layer === osmBuildingsLayerRef.value
              ? 'osm'
              : layer === knwStructuresLayerRef.value
                ? 'knw'
                : layer === piccBuildingsLayerRef.value
                  ? 'picc'
                  : layer === urbisBuildingsLayerRef.value
                    ? 'urbis'
                    : layer === candidateBuildingsLayerRef.value
                      ? properties._layer_type || 'grb'
                      : 'grb'

          foundFeatures.push(properties)
        }
        return false // Continue to collect all features
      },
      {
        hitTolerance: 3
      }
    )

    if (foundFeatures.length > 0) {
      // Make tooltip sticky with all found features
      clickedFeatures.value = foundFeatures
      isTooltipSticky.value = true
    } else {
      // Clicked outside features, close sticky tooltip
      closeTooltip()
    }
  })

  map.value.on('pointermove', (evt) => {
    if (!map.value) {
      return
    }

    // Debounce to reduce canvas read operations
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    debounceTimeout = setTimeout(() => {
      if (!map.value) return

      const pixel = map.value.getEventPixel(evt.originalEvent)

      // Only update cursor if not sticky
      if (!isTooltipSticky.value) {
        // No position tracking needed for fixed panel
      }

      // Clear previous hover state (only if not sticky)
      if (currentHoveredFeatureObj && !isTooltipSticky.value) {
        try {
          if (currentHoveredFeatureObj instanceof Feature) {
            currentHoveredFeatureObj.set('hovered', false)
          }
        } catch (error) {
          // Ignore errors when clearing hover state
        }
        currentHoveredFeatureObj = null
        hoveredFeatures.value = []
        setMapCursor('')
      }

      // Check if we're hovering over features from building layers (collect all)
      const foundFeatures: any[] = []
      let firstFeature: any = null

      map.value.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => {
          if (
            layer === osmBuildingsLayerRef.value ||
            layer === grbBuildingsLayerRef.value ||
            layer === knwStructuresLayerRef.value ||
            layer === piccBuildingsLayerRef.value ||
            layer === urbisBuildingsLayerRef.value ||
            layer === candidateBuildingsLayerRef.value
          ) {
            if (!firstFeature) {
              firstFeature = feature
            }

            // Get properties - handle both regular features and vector tile features
            let properties: any
            try {
              // Both Feature and vector tile RenderFeature expose getProperties()
              properties = feature.getProperties()
            } catch (error) {
              console.warn('Error getting feature properties:', error)
              properties = {}
            }

            // Extract feature ID and add it to properties
            const featureId = feature.getId() ?? null
            if (featureId) {
              if (layer === osmBuildingsLayerRef.value) {
                properties.osm_id = featureId
              } else {
                properties.id = featureId
              }
            }

            // Add layer type to distinguish OSM from GRB/PICC features
            properties._layer_type =
              layer === osmBuildingsLayerRef.value
                ? 'osm'
                : layer === knwStructuresLayerRef.value
                  ? 'knw'
                  : layer === piccBuildingsLayerRef.value
                    ? 'picc'
                    : layer === urbisBuildingsLayerRef.value
                      ? 'urbis'
                      : layer === candidateBuildingsLayerRef.value
                        ? properties._layer_type || 'grb'
                        : 'grb'

            foundFeatures.push(properties)
          }
          return false // Continue to collect all features
        },
        {
          hitTolerance: 3
        }
      )

      if (foundFeatures.length > 0 && !isTooltipSticky.value) {
        // Clear previous hover state
        if (currentHoveredFeatureObj && currentHoveredFeatureObj !== firstFeature) {
          if (currentHoveredFeatureObj instanceof Feature) {
            currentHoveredFeatureObj.set('hovered', false)
          }
        }

        // Set new hover state on first feature
        if (currentHoveredFeatureObj !== firstFeature) {
          // Only set hover state for regular features, not vector tile features
          try {
            if (firstFeature instanceof Feature && firstFeature.set) {
              firstFeature.set('hovered', true)
            }
          } catch (error) {
            // Vector tile features don't support set method
          }
          currentHoveredFeatureObj = firstFeature

          hoveredFeatures.value = foundFeatures

          // Change cursor to pointer
          setMapCursor('pointer')
        }
      } else if (!isTooltipSticky.value) {
        // Clear hover state
        if (currentHoveredFeatureObj) {
          try {
            if (currentHoveredFeatureObj instanceof Feature && currentHoveredFeatureObj.set) {
              currentHoveredFeatureObj.set('hovered', false)
            }
          } catch (error) {
            // Vector tile features don't support set method
          }
          currentHoveredFeatureObj = null
          hoveredFeatures.value = []

          // Reset cursor
          setMapCursor('')
        }
      }
    }, 16) // ~60fps, reduces canvas reads significantly
  })
}

onMounted(() => {
  loadDataDates()
  nextTick(() => {
    setTimeout(() => {
      setupMap()
      setupHoverInteraction()

      // Check initial zoom level for layer visibility
      if (map.value) {
        const initialZoom = Math.round(map.value.getView().getZoom() || 13)
        handleZoomBasedLayerVisibility(initialZoom)
      }

      // Automatically load OSM and GRB layers
      setTimeout(() => {
        handleLoadOSM()
        handleLoadGRB()
        handleLoadKNW()
        handleLoadPICC()
        handleLoadUrbis()
      }, 100)
    }, 50)
  })

  // One quiet probe so the JOSM status chip reflects reality on load.
  checkJosm()

  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  destroy()
})
</script>
