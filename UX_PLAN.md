# BE2OSM — UX Improvement Plan for OSM Builders

Audience: OpenStreetMap mappers who use BE2OSM to find Belgian buildings missing from
OSM and push them into JOSM for upload. This is a product-tool plan, not a marketing
redesign. Everything below is grounded in the current code; file references included.

## The core job (what a mapper actually does)

1. Navigate to an area they want to improve.
2. Turn on a source layer (GRB / KNW / PICC / UrbIS) and OSM Buildings.
3. Zoom to >= 16.
4. Run "Get Difference" to find candidates missing from OSM.
5. Review candidates, optionally simplify geometry.
6. Push candidates to JOSM, then upload from JOSM.

The tool is functional, but it assumes the user already knows BE2OSM, OSM, vector tiles,
the zoom rule, the layer rules, and JOSM remote control. A first-timer gets no guidance,
and several signals (mocked QA tools, errors-as-instructions, silent empty states) make
the app feel less trustworthy than it is.

## Guiding principles for this plan

- Turn **gates into guidance.** Every "you can't do X yet" toast is a prerequisite the UI
  should make obvious _before_ the user clicks, with a one-click path to satisfy it.
- **Honesty over polish.** Remove or finish mocked features. A fake "QA Tools" panel
  erodes trust more than an absent one.
- **State the system's state.** Loading, empty, error, and success each get a distinct,
  in-context surface, not a 5-second toast that vanishes.
- **Respect the expert.** Mappers are power users. Add keyboard paths and persistent
  status; never block them with modal hand-holding they can dismiss for good.

---

## Prioritized improvements

### P0 — Trust and clarity (do first, low/medium effort, high impact)

**1. A persistent "Workflow status" strip instead of gating toasts.**
Replace the three validation toasts in `calculateDifference` (`InteractiveMap.vue:1606,1615,1621`)
with an always-visible compact checklist near the "Get Difference" button:

- ☐ Source layer on (GRB/KNW/PICC/UrbIS) → click to open the Layers panel
- ☐ OSM Buildings on
- ☐ Zoom >= 16 (shows current zoom, with a "Zoom to 16" action)
  Each item flips to ☑ as satisfied; the button enables only when all are met. The user
  sees _why_ the button is disabled without clicking it. Keep the toasts only as a fallback.
  Effort: M. Impact: High.

**2. Resolve the mocked QA Tools.** `QAToolsPanel.vue:114-122` fakes progress bars and
always reports success; `ObjectInfoPanel.vue` "QA Tools" tab embeds it. Decide:

- (a) Remove the QA Tools tab/panel and the "Access QA tools" benefit line in
  `AuthDialog.vue:64-68` until real checks exist, **or**
- (b) Implement the three checks for real (simplify uses the existing Turf/mapshaper path
  already wired for export; self-intersection via `ST_IsValid`/turf; metadata validation
  against levels/height).
  Recommendation: ship (a) now, schedule (b). Shipping a visible fake is the bigger UX cost.
  Effort: S (remove) / L (build). Impact: High (trust).

**3. Distinguish "no candidates" from "error" and from "success".** Today both ends call a
toast (`:1644` info, `:1724` error) and the empty case silently drops the layer
(`:1647-1654`). Add a small results panel that has three explicit states:

- Success: "N candidates found in view" + count + clear action to export.
- Empty: "No missing buildings here. Everything in view already matches OSM." with a hint
  to pan/zoom or switch match mode. Not a disappearing toast.
- Error: inline message with a "Retry" button (no need to re-hunt the Get Difference button).
  Effort: M. Impact: High.

**4. Move JOSM setup out of the error toast into real help.** `getJosmInstructions()`
(`useJosmExport.ts:245`) is fully written but never shown. Surface it as:

- A small "JOSM not connected" status chip near the export button (green when
  `testJosmConnection` passes, grey otherwise), polled lightly.
- A "Set up JOSM" link opening a dialog that renders `getJosmInstructions()`.
  Then the export error (`:1744`) can be short and point at that dialog instead of cramming
  8 steps into a toast.
  Effort: M. Impact: High.

**5. First-run guidance (one-time, dismissible).** On first load (zoom 8, no layers), show a
lightweight 3-step coachmark or a collapsible "Getting started" card: pick an area, turn on
a source layer, zoom in, run Get Difference, push to JOSM. Persist dismissal in
localStorage. No blocking modal. This is the single biggest gap for new mappers.
Effort: M. Impact: High.

### P1 — Workflow comprehension (medium effort, medium/high impact)

**6. Label which match mode and freshness produced the current results.** After a run, show
"Geometry overlap >= 85% · OSM mirror" (or "· Live Overpass") on the results panel. Today
the user can change mode/threshold (`MatchModeControl.vue`) and re-run with no indication of
what the visible candidates represent.
Effort: S. Impact: Medium.

**7. Clarify the Overpass toggle.** `MatchModeControl.vue:72-83` reads as jargon
("Live OSM from Overpass (GRB, slower, most up-to-date)"). Add a short helper line or
info popover: "Uses the live OSM database for this view instead of our daily copy. Slower,
but reflects edits made in the last 24h." Show a subtle "live" badge on results when active.
Effort: S. Impact: Medium.

**8. Make the mutually-exclusive layer behavior legible.** Toggling GRB silently disables
PICC/UrbIS/KNW (`InteractiveMap.vue:1160-1257`). Group these four as a single-select control
("Source dataset: GRB | KNW | PICC | UrbIS") so exclusivity is visually built-in, rather than
four independent toggles that mysteriously turn each other off.
Effort: M. Impact: Medium.

**9. Surface per-candidate review.** `ObjectInfoPanel.vue` and `GRBBuildingPanel.vue` exist but
`activeBuilding`/`panelOpen` are never set in the normal flow, so the rich per-building info is
unreachable. Wire clicking a candidate to open that panel (Overview / Compare), giving mappers
a real review step before export, and a place to act on a single building.
Effort: M. Impact: Medium/High (this is a missing core step).

**10. Make simplification discoverable at the right moment.** `SimplificationControl` is part of
the export path but easy to miss. Offer it inside the results panel as an optional pre-export
step ("Simplify geometry before export") with a live before/after node count, so mappers do not
push over-noded GRB polygons by accident.
Effort: M. Impact: Medium.

### P2 — Robustness, performance, accessibility (medium effort, medium impact)

**11. Guard against huge candidate sets.** All candidates load into one VectorLayer
(`:1667`) with no cap. In dense areas this can be tens of thousands of features. Add a
soft cap with a clear message ("Showing first 2,000 of 8,431. Zoom in to review the rest.")
and consider count-only preview before rendering. Protects both the browser and the
mapper's ability to review responsibly (mass imports need care).
Effort: M. Impact: Medium.

**12. Keyboard and focus.** Today only Esc closes the tooltip (`:537`). Add: `G` to run Get
Difference, `J` to push to JOSM, arrow/Tab to step through candidates, focus rings on all
controls, ARIA labels on the icon buttons, and focus trapping in dialogs. Mappers live on
the keyboard; this also fixes basic a11y debt.
Effort: M. Impact: Medium.

**13. Auth vs JOSM expectation-setting.** Logging in is not required to push to JOSM (export
works unsigned); JOSM is. `AuthDialog.vue` lists benefits that imply otherwise (and references
the mocked QA tools). Clarify in the dialog what login is for (attribution, changeset history)
versus what JOSM is for (the actual editing/upload). Effort: S. Impact: Medium.

**14. Copy pass.** Plain-language, consistent labels across panels and toasts; one term per
concept ("candidates", "source dataset", "match mode"). No em-dashes in UI strings. Audit
every visible string for clarity (some toasts duplicate help content). Effort: S. Impact: Low/Medium.

### P3 — nice to haves

- "Clear search history" affordance in `SearchBar.vue`.
- Tooltip lifecycle cleanup so pinned tooltips never show stale data (`:2259-2380`).
- Remember last-used match mode / dataset / base layer per user.
- A subtle base-map switcher hint (Flanders/Wallonia/Brussels ortho exist but are hidden by default).

---

## Suggested phasing

- **Phase 1 (trust + orientation):** items 1, 2, 3, 4, 5. ✅ Done (commit 1fb42a1).
- **Phase 2 (comprehension + review):** items 6, 7, 8, 9, 10. ✅ Done (commit bc7208e).
- **Phase 3 (robustness):** items 11, 12, 13, 14. ✅ Done (this commit).

### Implementation notes

- Item 9 was delivered by making the candidate layer clickable (it was not before) and
  routing it through the existing info tooltip, rather than the orphaned ObjectInfoPanel
  (which expects a different `BuildingData` shape and would duplicate the tooltip).
- Item 10 reuses the export's existing mapshaper path (a checkbox + detail slider in the
  results panel). The live before/after node-count preview was deferred as lower-value.
- Item 11 cap = 2000 (`CANDIDATE_RENDER_CAP`), applied to both render and export for
  mass-import safety; the true total is still reported with a "showing first N of M" note.
- Item 13 was largely satisfied in Phase 1 (AuthDialog copy + the JOSM help dialog make the
  login-vs-JOSM split clear).

## Open decisions (need your call)

1. **QA Tools:** remove now (recommended) or commit to building the three real checks?
2. **First-run guidance:** coachmarks over the live map, or a dismissible "Getting started"
   card in a corner? (Card is lower-risk and easier to maintain.)
3. **Candidate cap:** what is a sane default ceiling for rendered candidates (e.g. 2,000),
   and do we want a hard cap or just a warning?
4. **Single source dataset selector:** acceptable to convert the four exclusive layer toggles
   into one segmented control, or keep them as toggles for parity with the base-layer UI?
