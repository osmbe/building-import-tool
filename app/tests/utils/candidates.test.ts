import { readFileSync } from "node:fs";
import type { Feature } from "geojson";
import { describe, expect, it } from "vite-plus/test";
import {
  CANDIDATES_CONTRACT,
  CANDIDATE_COLUMNS,
  CANDIDATE_VIEWS,
  type CandidateProperties,
  candidateDetail,
  candidateDisplayId,
  candidateTags,
  candidateTileUrl,
  candidateToOsmFeature,
  isCandidateSource,
} from "~/utils/candidates";
import { VERDIEPING_FIXME } from "~/utils/grbExportTags";

const candidate = (
  props: Partial<CandidateProperties>,
): CandidateProperties => ({
  address_count: 0,
  addresses: "",
  area_m2: 10,
  details: {},
  entity: "Gbg",
  fid: 1,
  municipalities: "",
  origin_label: null,
  parent_area_m2: null,
  parent_id: null,
  parent_part_count: null,
  parent_type_label: null,
  postcodes: "",
  source: "grb",
  source_id: "1",
  source_ref: "Gbg/1",
  street_names: "",
  survey_date: null,
  type_code: null,
  type_label: "hoofdgebouw",
  ...props,
});

const knw = (props: Partial<CandidateProperties>) =>
  candidate({
    entity: "Knw",
    source: "knw",
    source_id: "1",
    source_ref: "Knw/1",
    type_label: null,
    ...props,
  });
const picc = (props: Partial<CandidateProperties> = {}) =>
  candidate({
    entity: null,
    source: "picc",
    source_id: "11",
    source_ref: null,
    type_code: "BAT",
    ...props,
  });
const urbis = (props: Partial<CandidateProperties> = {}) =>
  candidate({
    entity: null,
    source: "urbis",
    source_id: "21",
    source_ref: null,
    type_label: null,
    ...props,
  });

describe("the candidates contract", () => {
  it("names the view and the tile source of every source", () => {
    expect(CANDIDATE_VIEWS).toEqual({
      grb: "grb.candidates",
      knw: "grb.knw_candidates",
      picc: "picc.candidates",
      urbis: "urbis.candidates",
    });
    expect(candidateTileUrl("grb")).toBe("/tiles/grb/candidates/{z}/{x}/{y}");
    expect(candidateTileUrl("knw")).toBe(
      "/tiles/grb/knw_candidates/{z}/{x}/{y}",
    );
    expect(candidateTileUrl("urbis")).toBe(
      "/tiles/urbis/candidates/{z}/{x}/{y}",
    );
  });

  it("lists the columns of the views (tests/db/cases/16-candidates-contract.sh checks the database side)", () => {
    expect(CANDIDATE_COLUMNS[0]).toBe("fid");
    expect(CANDIDATE_COLUMNS).toHaveLength(20);
  });

  it("is the contract version the server bootstrap sends with its difference check", () => {
    const script = readFileSync(
      new URL("../../../scripts/server-bootstrap.sh", import.meta.url),
      "utf8",
    );
    expect(script).toContain(`"contract":${CANDIDATES_CONTRACT}}`);
  });

  it("recognises the sources", () => {
    expect(isCandidateSource("picc")).toBe(true);
    expect(isCandidateSource("osm")).toBe(false);
    expect(isCandidateSource(undefined)).toBe(false);
  });

  it("reads an extra from details (API) or from the feature itself (tiles)", () => {
    expect(
      candidateDetail({ details: { georef_id: "G-11" } }, "georef_id"),
    ).toBe("G-11");
    expect(candidateDetail({ georef_id: "G-11" }, "georef_id")).toBe("G-11");
    expect(candidateDetail({ details: {} }, "length_m")).toBeNull();
    expect(candidateDetail({ details: null, length_m: 8 }, "length_m")).toBe(8);
  });

  it("shows the GRB building id, else the source id", () => {
    expect(candidateDisplayId(candidate({ parent_id: "5001" }))).toBe("5001");
    expect(candidateDisplayId(candidate({ source_id: "1003" }))).toBe("1003");
    expect(candidateDisplayId(picc({ parent_id: "x" }))).toBe("11");
  });
});

describe("candidateTags: buildings (#53)", () => {
  it("tags GRB building types as building=yes", () => {
    for (const type_label of ["hoofdgebouw", "Bijgebouw", "verdieping", null])
      expect(candidateTags(candidate({ type_label })).building).toBe("yes");
  });

  it.each([
    "gebouw afgezoomd met virtuele gevels",
    "trap",
    "loopbrug",
    "luifel",
    "verheven garagetoegang",
  ])('does not tag the GRB type "%s" as a building', (type_label) => {
    const tags = candidateTags(candidate({ type_label }));
    expect(tags.building).toBeUndefined();
    expect(tags.fixme).toBeUndefined();
  });

  it('tags the GRB type "afdak" (gba-2) as building=roof, without a fixme', () => {
    expect(candidateTags(candidate({ type_label: "afdak" })).building).toBe(
      "roof",
    );
    expect(candidateTags(candidate({ type_label: " Afdak " })).building).toBe(
      "roof",
    );
    expect(
      candidateTags(candidate({ type_label: "afdak" })).fixme,
    ).toBeUndefined();
  });

  it("flags a verdieping for manual correction, case-insensitively", () => {
    expect(candidateTags(candidate({ type_label: "VERDIEPING" })).fixme).toBe(
      VERDIEPING_FIXME,
    );
  });

  it("tags PICC and UrbIS buildings whatever their type label (the GRB allow-list is GRB only)", () => {
    expect(candidateTags(picc({ type_label: "Batiment" })).building).toBe(
      "yes",
    );
    expect(
      candidateTags(picc({ type_label: "verdieping" })).fixme,
    ).toBeUndefined();
    expect(candidateTags(picc({ type_label: "afdak" })).building).toBe("yes");
    expect(candidateTags(urbis()).building).toBe("yes");
  });
});

describe("candidateTags: references and dates", () => {
  it("writes the source reference (GRB entity per polygon, KNW)", () => {
    expect(
      candidateTags(candidate({ source_ref: "Gba/2664" }))[
        "source:geometry:ref"
      ],
    ).toBe("Gba/2664");
    expect(
      candidateTags(knw({ source_ref: "Knw/99" }))["source:geometry:ref"],
    ).toBe("Knw/99");
    expect(candidateTags(picc())).not.toHaveProperty("source:geometry:ref");
  });

  it("writes the survey date of every source, date-only (#49)", () => {
    expect(
      candidateTags(candidate({ survey_date: "2023-03-15" }))[
        "source:geometry:date"
      ],
    ).toBe("2023-03-15");
    expect(
      candidateTags(picc({ survey_date: "2019-05-20T00:00:00" }))[
        "source:geometry:date"
      ],
    ).toBe("2019-05-20");
    expect(
      candidateTags(knw({ survey_date: "2022-01-10" }))["source:geometry:date"],
    ).toBe("2022-01-10");
  });

  it.each(["unknown", "03/2023", "2023-3-5"])(
    "leaves out a malformed survey date (%s)",
    (survey_date) => {
      expect(candidateTags(candidate({ survey_date }))).not.toHaveProperty(
        "source:geometry:date",
      );
    },
  );

  it("exports only OSM tags, in a stable order", () => {
    expect(
      Object.keys(
        candidateTags(
          candidate({
            address_count: 1,
            addresses: "Kerkstraat 1",
            municipalities: "Antwerpen",
            postcodes: "2000",
            street_names: "Kerkstraat",
            survey_date: "2023-03-15",
            type_label: "verdieping",
          }),
        ),
      ),
    ).toEqual([
      "building",
      "fixme",
      "source:geometry:date",
      "source:geometry:ref",
      "addr:street",
      "addr:housenumber",
      "addr:postcode",
      "addr:city",
    ]);
  });
});

describe("candidateTags: KNW default tags (#22)", () => {
  it.each([
    ["1", { man_made: "bridge" }],
    ["5", { man_made: "bridge_support" }],
    ["7", { man_made: "chimney" }],
    ["8", { man_made: "cooling_tower" }],
    ["11", { man_made: "water_tower" }],
    [
      "14",
      {
        "generator:method": "wind_turbine",
        "generator:source": "wind",
        power: "generator",
      },
    ],
    ["22", { man_made: "breakwater" }],
    ["23", { man_made: "breakwater" }],
    ["24", { man_made: "pier" }],
  ])(
    "maps type %s to its documented tags, without a building tag",
    (type_code, expected) => {
      const tags = candidateTags(knw({ type_code }));
      expect(tags).toMatchObject(expected);
      expect(tags.building).toBeUndefined();
    },
  );

  it.each(["2", "3", "4", "6", "10", "12", "13", null])(
    "leaves type %s without default tags",
    (type_code) => {
      const tags = candidateTags(knw({ type_code }));
      for (const key of ["man_made", "power", "building"])
        expect(tags[key]).toBeUndefined();
      expect(tags["source:geometry:ref"]).toBe("Knw/1");
    },
  );

  it("tells storage tanks from silos (type 9)", () => {
    expect(
      candidateTags(knw({ type_code: "9", type_label: "Opslagtank" })).man_made,
    ).toBe("storage_tank");
    expect(
      candidateTags(knw({ type_code: "9", type_label: "silo, opslagtank" }))
        .man_made,
    ).toBe("silo");
    expect(candidateTags(knw({ type_code: "9" })).man_made).toBe("silo");
  });

  it("never writes an address on a structure", () => {
    const tags = candidateTags(
      knw({
        address_count: 1,
        addresses: "Kerkstraat 1",
        street_names: "Kerkstraat",
      }),
    );
    expect(tags).not.toHaveProperty("addr:street");
  });
});

describe("candidateTags: addresses (#49)", () => {
  const single = (props: Partial<CandidateProperties>) =>
    candidateTags(candidate({ address_count: 1, ...props }));

  it("writes the address of a single-address candidate", () => {
    expect(
      single({
        addresses: "Kerkstraat 12",
        municipalities: "Gent",
        postcodes: "9000",
        street_names: "Kerkstraat",
      }),
    ).toMatchObject({
      "addr:city": "Gent",
      "addr:housenumber": "12",
      "addr:postcode": "9000",
      "addr:street": "Kerkstraat",
    });
  });

  it("writes the address of PICC and UrbIS buildings too", () => {
    expect(
      candidateTags(
        picc({
          address_count: 1,
          addresses: "Rue de Fer 5",
          street_names: "Rue de Fer",
        }),
      ),
    ).toMatchObject({ "addr:housenumber": "5", "addr:street": "Rue de Fer" });
  });

  it("writes no address for several addresses or an empty one", () => {
    expect(
      single({
        address_count: 2,
        addresses: "Kerkstraat 12; Kerkstraat 14",
        street_names: "Kerkstraat",
      }),
    ).not.toHaveProperty("addr:street");
    expect(
      single({ addresses: "  ", street_names: "Kerkstraat" }),
    ).not.toHaveProperty("addr:street");
    expect(single({ addresses: null })).not.toHaveProperty("addr:street");
  });

  it.each([
    ["Rue de la Gare 5A/3", "Rue de la Gare", "5A/3"],
    ["Kerkstraat 12 b", "Kerkstraat", "12b"],
    ["12 Main Street", "Kerkstraat", "12"],
  ])('parses the house number of "%s"', (addresses, street_names, expected) => {
    expect(single({ addresses, street_names })["addr:housenumber"]).toBe(
      expected,
    );
  });

  it("writes no house number when the address does not start with one after the street", () => {
    const tags = single({
      addresses: "Dorpsplein 12",
      postcodes: "9000",
      street_names: "Kerkstraat",
    });
    expect(tags["addr:street"]).toBe("Kerkstraat");
    expect(tags["addr:housenumber"]).toBeUndefined();
    expect(
      single({ addresses: "Kerkstraat zn", street_names: "Kerkstraat" })[
        "addr:housenumber"
      ],
    ).toBeUndefined();
  });

  it("takes the first entry of the lists and tolerates missing ones", () => {
    expect(
      single({
        addresses: "7",
        municipalities: "Gent, Gentbrugge",
        postcodes: "9000, 9050",
        street_names: null,
      }),
    ).toEqual({
      "addr:city": "Gent",
      "addr:housenumber": "7",
      "addr:postcode": "9000",
      building: "yes",
      "source:geometry:ref": "Gbg/1",
    });
  });
});

describe("candidateToOsmFeature", () => {
  it("replaces the properties with the tags and keeps the geometry", () => {
    const input: Feature = {
      geometry: { coordinates: [4, 51], type: "Point" },
      properties: candidate({ source_ref: "Gbg/7" }),
      type: "Feature",
    };
    const out = candidateToOsmFeature(input);
    expect(out.geometry).toBe(input.geometry);
    expect(out.properties).toEqual({
      building: "yes",
      "source:geometry:ref": "Gbg/7",
    });
    expect(input.properties).toMatchObject({ source_ref: "Gbg/7" });
  });
});
