# GRB address summaries and `building:flats` — implementation plan

## 1. Main goals

1. **A building gets an address whenever all of its main addresses are on one street.**
   - Multiple house numbers on that street are allowed and are summarized into one `addr:housenumber` value.
   - A polygon whose main addresses span more than one street gets no address tags at all.
   - Subaddresses (`box_number` set, i.e. “bus” numbers) are kept in the database but are excluded from the address value.
   Fixes #136

2. **House numbers are summarized with odd/even ranges.**
   - `1,3,5` becomes `1-5`.
   - `2,4,6` becomes `2-6`.
   - `1,3` stays `1,3`; `1,5` stays `1,5`.
   - `1,1A,3,5` becomes `1,1A,3-5` (letter variants stay separate).
   - `1,2,3,5` stays unchanged because it mixes odd and even numbers.
   - The exported separator is a comma, not a semicolon.
Fixes #135

3. **A new `building:flats` tag is exported to JOSM.**
   - GRB only.
   - Per exported candidate polygon, not summed across a GRB parent building.
   - Only when the polygon is exported with `building=yes` (not `building=roof`, and not filtered-out GRB types).
   - Value is an integer count of flats/units:
     - for every main address that has subaddresses, count its subaddresses but **not** the main address itself;
     - for every main address without subaddresses, count `1`.
   - Do not write the tag when the total is `0`, `1`, or `NULL`.

4. **JOSM export never writes `addr:city` or `addr:postcode`.**
   - This applies to every source: GRB, PICC and UrbIS.
   - The data stays in the database/API/tiles for the UI and for previous-release compatibility; only the exported tags are removed.
   Fixes #130

5. **Keep existing per-polygon and identity semantics.**
   - Addresses are joined by spatial containment (`ST_Contains`), as today.
   - `source:geometry:ref` remains `Entity/oidn`; `gebouw_id` is never used for address grouping.
   - `building:flats` is calculated per candidate polygon, because that is the object exported to OSM.

---

## 2. High-level changes

1. **Database**
   - Add a new heavy GRB migration, `grb/008_address_summary.sql`.
   - It defines a reusable house-number summary function.
   - It rebuilds `grb.buildings_with_addresses` with:
     - main-address filtering (exclude `box_number`);
     - one-street validation;
     - summarized `house_numbers`;
     - a `flats` count;
     - the existing `addresses`, `street_names`, `postcodes`, `municipalities` and `address_count` columns.
   - It recreates `grb.candidates` with structured address data in `details`.

2. **API / tiles**
   - No new contract column is needed. `details` already exists and is exposed by Martin.
   - `details` gains:
     - `street`: the single street name, when applicable;
     - `house_numbers`: the summarized house-number string, when applicable;
     - `flats`: the integer flat count, only when it is greater than `1`.
   - The contract version is bumped to `2` so a page loaded before the deploy reloads instead of exporting old address semantics.

3. **JOSM export**
   - `candidateTags` reads the structured GRB address data from `details`.
   - It writes:
     - `addr:street`;
     - `addr:housenumber`;
     - `building:flats` when the count is greater than `1`.
   - It never writes `addr:postcode` or `addr:city`.
   - PICC and UrbIS keep the existing “exactly one address” rule for address tags, except that postcode/city are no longer exported.

4. **Tests and documentation**
   - Add a dedicated database test for the summary and flats logic.
   - Update unit and integration tests.
   - Update the schema/architecture/address documentation.
   - Register the intentional previous-release snapshot/test changes.

---

## 3. Data model and algorithms

### 3.1 Main addresses and subaddresses

- A row in `grb.addresses` is a **main address** when `box_number IS NULL` or `btrim(box_number) = ''`.
- A row is a **subaddress** when `box_number` is non-empty.
- Subaddresses remain in `grb.addresses`; they are only excluded from the address string and house-number summary.
- Main-address identity for counting: `(btrim(street_name), normalized_house_number)`.
- Subaddress identity for counting: `(btrim(street_name), normalized_house_number, btrim(box_number))`.
- Duplicate address rows are counted once per identity above.

`house_number` is used when present. For old/imported rows without it, fall back to the part of `full_address` after the street name, as the v7088 upgrade fixture does not populate `house_number`.

### 3.2 Street rule

For each polygon:

- `street_count = COUNT(DISTINCT btrim(street_name))` over main addresses.
- If `street_count = 1`:
  - `street_name` / `street_names` = that street;
  - `house_numbers` = summarized main house numbers;
  - `addresses` = `street || ' ' || house_numbers`;
  - `address_count` = number of distinct main house numbers.
- If `street_count > 1`:
  - `addresses = ''`;
  - `street_names = ''`;
  - `house_numbers = ''`;
  - `address_count = 0`;
  - but `flats` is still calculated from all main and subaddresses in the polygon.
- If there are no main addresses:
  - the address columns are empty and `address_count = 0`;
  - boxed addresses can still contribute to `flats`.

`postcodes` and `municipalities` continue to be aggregated for the UI/API and previous releases, but are never written to JOSM.

### 3.3 House-number summary rule

Input is the set of distinct main house numbers for one polygon.

1. Normalize values: trim whitespace, remove internal spaces, normalize numeric leading zeros, and treat letter suffixes case-insensitively for grouping.
2. Split values into:
   - pure numeric values (`1`, `12`, ...);
   - numeric values with a letter suffix (`1A`, `12B`, ...);
   - opaque values (`12/3`, `1-3`, ...).
3. If the numeric values mix odd and even bases, **do not create any ranges**. Emit the sorted values as a comma list.
4. Otherwise, group the bases into maximal runs where adjacent values differ by exactly `2` (the odd/even series). A gap splits the run.
5. A run becomes a range when:
   - the run has at least `3` bases; or
   - the whole set has more than `2` bases and the run has at least `2` bases.
6. Letter variants are never merged with their base number:
   - `1,1A` stays `1,1A`, not `1-1A`;
   - a run is split around a base that has letter variants.
   - After the split, a remaining run of two bases is still written as a range, which is why `1,1A,3,5` becomes `1,1A,3-5`.
7. Opaque values are kept verbatim, do not join ranges, and are emitted after the numeric summary.
8. Output is a comma-separated string without spaces.

Examples:

| Input | Output |
|---|---|
| `1,3,5` | `1-5` |
| `1,3` | `1,3` |
| `1,5` | `1,5` |
| `2,4,6` | `2-6` |
| `1,1A,3,5` | `1,1A,3-5` |
| `1,2,3,5` | `1,2,3,5` |
| `1,3,5,9,11` | `1-5,9-11` |
| `1,3,9` | `1-3,9` |
| `1,3,5,9` | `1-5,9` |
| `1,1A,3` | `1,1A,3` |

The range syntax is an odd/even series notation. This is intentional, but it is ambiguous to some OSM consumers (`1-5` can also be an official address label). Document this in the address mapping docs.

### 3.4 `building:flats` rule

For one polygon:

```text
main = distinct main addresses: (street, house_number)
sub  = distinct subaddresses:   (street, house_number, box_number)

flats =
    count(sub)
  + count(main m where no sub address has the same (street, house_number) as m)
```

This means:

- A main address with subaddresses contributes only its subaddresses.
- A main address without subaddresses contributes `1`.
- A boxed address without a matching main address still contributes through `count(sub)`.
- Duplicate `(street, house_number, box_number)` rows count once.

Examples:

| Addresses in polygon | `flats` |
|---|---|
| main `1` + sub `1/1`, `1/2` + main `3` | `3` |
| main `1` + sub `1/1` | `1` → no tag |
| main `1` + sub `1/1`, `1/2` | `2` |
| only sub `1/1`, `1/2` | `2` |
| main `1`, main `3` | `2` |
| no addresses | `0` → no tag |
| multi-street main `1` + sub `1/1` + main `2` | `2`; address tags omitted, `building:flats=2` written |

The tag is only exported when:

- `source = 'grb'`;
- the export will set `building=yes` (so `hoofdgebouw`, `bijgebouw`, `verdieping`, and unlabelled building polygons; not `afdak`, not filtered-out types);
- `flats > 1`.

---

## 4. Files to change and why

### 4.1 New migration

**`processing/sql/migrations/grb/008_address_summary.sql`** — new, heavy, no-transaction migration.

Why:

- `grb/003_buildings_with_addresses_entity.sql` is the current definition and aggregates all addresses, including subaddresses, as `'; '`-separated `full_address` values.
- `grb/004_candidates.sql` exposes `details` as `'{}'` for GRB.
- Applied migrations must not be edited, so the new behavior needs a new migration.
- The view rebuild is heavy on the production 5M-row GRB table and must be built next to the live view and swapped.

Specific changes:

- Add `-- migrate:no-transaction` and `-- migrate:heavy`.
- Create `grb.summarize_house_numbers(text[]) RETURNS text` with the rule from section 3.3.
  - Mark it `IMMUTABLE`, `PARALLEL SAFE`.
  - Handle `NULL`/empty input.
- Build `buildings_with_addresses` under `_v3` when the current view exists; build under the final name on a fresh database.
- Use CTEs equivalent to:

```sql
WITH main_addresses AS (
    SELECT
        bp.id AS polygon_id,
        btrim(a.street_name) AS street_name,
        COALESCE(
            NULLIF(btrim(a.house_number), ''),
            NULLIF(btrim(substr(a.full_address, length(a.street_name) + 1)), '')
        ) AS house_number
    FROM grb.building_polygons bp
    JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
    WHERE (a.box_number IS NULL OR btrim(a.box_number) = '')
      AND a.street_name IS NOT NULL
),
sub_addresses AS (
    SELECT
        bp.id AS polygon_id,
        btrim(a.street_name) AS street_name,
        btrim(a.house_number) AS house_number,
        btrim(a.box_number) AS box_number
    FROM grb.building_polygons bp
    JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
    WHERE a.box_number IS NOT NULL
      AND btrim(a.box_number) <> ''
      AND a.house_number IS NOT NULL
      AND btrim(a.house_number) <> ''
)
-- aggregate distinct main addresses, subaddresses, street counts and flats per polygon_id
```

- Add `street_name` and `house_numbers` as internal columns of `buildings_with_addresses`.
- Add `flats integer` as an internal column.
- Keep the existing contract-facing columns:
  - `addresses`
  - `street_names`
  - `postcodes`
  - `municipalities`
  - `address_count`
- Keep `postcodes` and `municipalities` populated for UI/API/previous-release compatibility.
- Recreate the existing indexes on `_v3`, then swap:
  - `DROP MATERIALIZED VIEW grb.buildings_with_addresses CASCADE`;
  - rename `_v3`;
  - rename indexes;
  - recreate `grb.candidates`.
- `grb.candidates` keeps exactly the same columns, types and order. Only `details` changes:

```sql
jsonb_strip_nulls(jsonb_build_object(
    'street', NULLIF(bwa.street_name, ''),
    'house_numbers', NULLIF(bwa.house_numbers, ''),
    'flats', CASE WHEN bwa.flats > 1 THEN bwa.flats END
)) AS details
```

- Make the migration resumable:
  - reuse an existing `_v3`;
  - recreate a missing `grb.candidates`;
  - leave no `_v3` after success.

### 4.2 Export tags

**`app/utils/candidates.ts`**

Why:

- `addressTags` currently only writes an address when `address_count === 1`.
- It parses the house number from `addresses` with a regex.
- It writes `addr:postcode` and `addr:city`.
- It has no `building:flats` logic.

Specific changes:

- Bump `CANDIDATES_CONTRACT` from `1` to `2`.
- Keep `CANDIDATE_COLUMNS` and `CandidateProperties` unchanged; `details` already exists.
- Rewrite `addressTags`:
  - For GRB, read `candidateDetail(props, 'street')` and `candidateDetail(props, 'house_numbers')`.
  - Write `addr:street` and `addr:housenumber` when both are non-empty.
  - Do not require `address_count === 1` for GRB.
  - Keep the current single-address regex fallback for old/absent details.
  - Keep the existing one-address behavior for PICC/Urbis.
  - Remove all `addr:postcode` / `addr:city` writes.
- In `candidateTags`, after the existing building tag logic:
  - If `props.source === 'grb'` and `tags.building === 'yes'`, read `candidateDetail(props, 'flats')`.
  - If the value is a number greater than `1`, set `building:flats` to the integer string.
- Update comments describing the address rules.

### 4.3 Bootstrap contract value

**`scripts/server-bootstrap.sh`**

Why:

- The bootstrap sends a literal `"contract":1` in its difference-check request.
- The app/API contract changes to `2`.

Specific change:

- Change the body to `"contract":2`.

### 4.4 UI

**`app/components/InteractiveMap.vue`**

Why:

- The GRB panel currently parses `addresses` and groups “bus” subaddresses.
- The new `addresses` value is a single summarized string, so no bus groups will appear.

Specific change:

- No functional change is required; the existing display will show the summarized address.
- Update the comment from “grouped by base address” to “summarized address”.
- Optionally show `Flats: N` in the details section when `candidateDetail(currentFeature, 'flats') > 1`. This is not required for the export goal.

### 4.5 Martin configuration

**`config/martin/grb-config.yaml`** — no change.

Why:

- `details` is already mapped as `details: details`.
- Martin expands jsonb keys into tile properties automatically.
- `street`, `house_numbers` and `flats` therefore reach the tiles without a config change.

### 4.6 Tests

**New `tests/db/cases/17-address-summary.sh`**

Why:

- The shared GRB fixtures currently contain one address. Changing them would change API snapshots and conflict with the previous-release test, which reuses the previous fixtures.
- A dedicated case can insert controlled addresses and test the full matrix.

Tests:

- Direct `grb.summarize_house_numbers` matrix:
  - `1,3,5` → `1-5`
  - `1,3` → `1,3`
  - `1,5` → `1,5`
  - `2,4,6` → `2-6`
  - `1,1A,3,5` → `1,1A,3-5`
  - `1,2,3,5` → `1,2,3,5`
  - `1,3,5,9,11` → `1-5,9-11`
  - `1,3,9` → `1-3,9`
  - `1,3,5,9` → `1-5,9`
  - `1,1A,3` → `1,1A,3`
- View behavior with inserted polygons/addresses:
  - subaddresses excluded from `addresses` but used by `flats`;
  - one street with `1,1A,3,5` → `addresses='Kerkstraat 1,1A,3-5'`, `address_count=4`;
  - main with two subs + standalone main → `flats=3`;
  - main with one sub → no `flats` key;
  - only subs → `flats=2`;
  - two streets → address columns empty, but `flats` still set when `>1`;
  - no addresses → `address_count=0`, no `flats`;
  - `grb.candidates.details` contains `street`, `house_numbers` and `flats` as expected.

**`tests/db/cases/16-candidates-contract.sh`**

Why:

- The contract shape stays the same, but GRB `details` now contains address keys.
- The contract test should assert the structured values.

Changes:

- Keep the column/type/order assertion unchanged.
- Add assertions for `details->>'street'`, `details->>'house_numbers'` and, where applicable, `details->>'flats'`.
- Keep the existing single-address fixture expectations; the shared fixture is not changed.

**`tests/db/cases/30-grb-import.sh`**

Why:

- The view now has `house_numbers` and `flats` columns, and address aggregation excludes subaddresses.

Changes:

- Assert `house_numbers` for the fixture address.
- Add a subaddress row only if it does not change API snapshots; otherwise cover this in `17`.
- Keep the existing schema-unchanged check.

**`tests/db/cases/20-upgrade-grb-7088.sh`**

Why:

- The legacy fixture inserts an address without `house_number`.
- The new aggregation must fall back to `full_address`.

Changes:

- Keep the existing `address_count = 1` assertion.
- Add an assertion that the fallback produced `house_numbers='1'`.

**`tests/db/cases/15-migrate-runner.sh`**

Why:

- The new migration builds `_v3` and swaps it.

Changes:

- Assert `grb.buildings_with_addresses_v3` does not exist after a successful run.
- Keep the existing index-name assertion.

**`tests/db/cases/60-martin.sh`**

Why:

- The new `details` keys must reach tiles.

Changes:

- Add a check that a GRB candidate tile carries `street`, `house_numbers` and, for a multi-flat fixture, `flats`.
- No Martin config change is expected.

**`app/tests/utils/candidates.test.ts`**

Why:

- Tag mapping changes.

Changes:

- Remove `addr:postcode` / `addr:city` from expected tag order and values.
- Add GRB tests:
  - details `{ street: 'Kerkstraat', house_numbers: '1,1A,3-5' }` → `addr:street`, `addr:housenumber`;
  - multiple addresses no longer require `address_count === 1`;
  - multi-street/no details → no address tags;
  - `flats=2` and `building=yes` → `building:flats=2`;
  - `flats=1`, `0`, `null` → no `building:flats`;
  - `afdak` / `building=roof` → no `building:flats`;
  - PICC/Urbis → no `addr:postcode` / `addr:city`.
- Keep the regex fallback tests for single-address PICC/Urbis.

**`app/tests/server/difference.test.ts`**

Why:

- The contract version changes.

Changes:

- Replace the invalid `2` in the contract test with `CANDIDATES_CONTRACT + 1`.

**`app/tests/integration/api.int.test.ts`**

Why:

- The GRB response now contains address details.
- The PICC export no longer contains postcode/city.

Changes:

- Update the GRB contract-properties assertion with `details: { street: 'Kerkstraat', house_numbers: '1' }`.
- Add an inline assertion for a GRB source-mode export: `addr:street` and `addr:housenumber` present, `addr:postcode`/`addr:city` absent.
- Keep the PICC/UrbIS candidate snapshots; only the export snapshot changes.
- Update the expected migration list if it checks all GRB migrations.

**Snapshots**

- `app/tests/integration/__snapshots__/difference-grb-source.json`: add the new `details` keys.
- `app/tests/integration/__snapshots__/export-picc-geometry.osm`: remove `addr:postcode` and `addr:city`.
- Other difference/export snapshots should remain unchanged because the shared fixtures are unchanged and GRB geometry export has no address.

**`tests/db/previous-release-snapshots.txt`**

Why:

- The previous release must still run against the migrated database.
- Its PICC export test cannot produce the new expected output because it still writes postcode/city.
- Its GRB inline test asserts `details: {}` and cannot match the new details.

Entries:

```text
difference-grb-source.json
skip-test: candidates carry the contract properties
skip-test: exports the picc candidates
```

- `difference-grb-source.json` is copied from the current tree because the previous release reads the same new `details` keys from the view.
- The two `skip-test` entries skip assertions that changed on purpose, as the file already documents.

### 4.7 Documentation

- **`docs/GRB_PROPERTY_MAPPINGS.md`**
  - Update the contract table: `details` carries `street`, `house_numbers`, `flats`.
  - Replace the “exactly one address” section with the one-street rule.
  - Document subaddress exclusion, comma summaries and range examples.
  - Document `building:flats`.
  - Remove `addr:postcode` and `addr:city` from the exported tag list and explain that they are still available in the UI/API.
- **`docs/GRB_ADDRESS_JOIN.md`**
  - Add the main/subaddress definitions and the per-polygon aggregation rule.
  - Explain that “assigned to the building” means spatially contained in the candidate polygon; `RltAdresGebouw` is still unused.
- **`docs/ARCHITECTURE.md`**
  - Change `contract: 1` to `contract: 2`.
  - Document the new `details` keys and the GRB address semantics.
- **`CLAUDE.md`**
  - Replace the statement that `grb/003` is the single source of truth with `grb/008`.
  - Document the address summary, `building:flats` and the export rule.
- **`processing/README.md`**
  - Mention that the GRB view excludes subaddresses from address tags but counts them for `building:flats`.

---

## 5. Verification plan

1. Unit and type checks:

```bash
cd app
npm run fmt
npm run lint
npm run typecheck
npm test
```

2. Database cases:

```bash
tests/db/run.sh 15 16 17 20 25 30 60
```

3. API integration and snapshots:

```bash
tests/db/run.sh 70
```

When a snapshot changes intentionally, rerun with the test stack and update it:

```bash
cd app
TEST_PG_PORT=55432 npx vp test run tests/integration -u
```

4. Previous release compatibility:

```bash
PREVIOUS_REF=HEAD~1 tests/db/run.sh 90
```

after the commit exists.

5. Manual spot checks:
   - A polygon with main `1`, sub `1/1`, sub `1/2` and main `3` gets `addr:housenumber`, no postcode/city, and `building:flats=3`.
   - A polygon with main `1` and sub `1/1` gets address tags but no `building:flats`.
   - A polygon with addresses on two streets gets no address tags but can get `building:flats`.
   - An `afdak` gets no `building:flats`.

---

## 6. Risks and assumptions

- **Heavy migration:** rebuilding the GRB view takes about 30 minutes on production. `-- migrate:heavy` makes deploys refuse it until it is run by hand, as documented in `docs/RUNBOOK.md`.
- **Range ambiguity:** `1-5` for `1,3,5` is an odd/even series, but some OSM consumers read it as a numeric range. This is intentional and must be documented.
- **Contract bump:** `CANDIDATES_CONTRACT = 2` forces a reload for pages open during the deploy. The database contract columns stay unchanged.
- **Previous release:** the view keeps `postcodes`/`municipalities` and the same contract columns so the previous Martin configs and API keep working. Only the export tags and `details` content change.
- **Flats identity:** main addresses are keyed by `(street, house_number)`; subaddresses by `(street, house_number, box_number)`. A boxed address without a matching main address still counts.
- **Flats grain:** per candidate polygon, not per `gebouw_id`. A GBG parent with multiple polygons can therefore get different `building:flats` values per polygon.
- **Flats types:** only when the export sets `building=yes`. `afdak`/`building=roof` and filtered-out GRB types do not get `building:flats`.
- **Multi-street:** address tags are omitted, but `building:flats` is still written when the total is greater than `1`.
- **Opaque house numbers:** values such as `12/3` and official ranges are kept verbatim and do not participate in generated ranges.
