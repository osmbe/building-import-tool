import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import { describe, expect, it } from "vite-plus/test";
import {
  extractFeaturesFromLayer,
  extractFeaturesFromSource,
} from "~/utils/openlayers";

const pointFeature = (
  lon: number,
  lat: number,
  props: Record<string, unknown> = {},
) => new Feature({ geometry: new Point(fromLonLat([lon, lat])), ...props });

const coordinatesOf = (feature: { geometry: unknown }) =>
  (feature.geometry as { coordinates: number[] }).coordinates;

describe("extractFeaturesFromLayer", () => {
  it("returns [] for a layer without a source", () => {
    expect(extractFeaturesFromLayer(new VectorLayer())).toEqual([]);
  });

  it("writes features as GeoJSON in EPSG:4326 with their properties", () => {
    const source = new VectorSource({
      features: [pointFeature(4.4, 51.2, { building: "yes" })],
    });
    const [feature, ...rest] = extractFeaturesFromLayer(
      new VectorLayer({ source }),
    );

    expect(rest).toHaveLength(0);
    expect(feature?.type).toBe("Feature");
    expect(feature?.properties).toEqual({ building: "yes" });
    const [lon, lat] = feature ? coordinatesOf(feature) : [];
    expect(lon).toBeCloseTo(4.4, 6);
    expect(lat).toBeCloseTo(51.2, 6);
  });

  it("can write in another target projection", () => {
    const source = new VectorSource({ features: [pointFeature(4.4, 51.2)] });
    const [feature] = extractFeaturesFromLayer(
      new VectorLayer({ source }),
      "EPSG:3857",
    );
    const expected = fromLonLat([4.4, 51.2]);
    const [x, y] = feature ? coordinatesOf(feature) : [];
    expect(x).toBeCloseTo(expected[0] ?? Number.NaN, 3);
    expect(y).toBeCloseTo(expected[1] ?? Number.NaN, 3);
  });
});

describe("extractFeaturesFromSource", () => {
  it("returns [] for an empty source", () => {
    expect(extractFeaturesFromSource(new VectorSource())).toEqual([]);
  });

  it("reprojects polygons from Web Mercator to EPSG:4326 by default", () => {
    const ring = [
      [4, 51],
      [4.001, 51],
      [4.001, 51.001],
      [4, 51],
    ].map((c) => fromLonLat(c));
    const source = new VectorSource({
      features: [new Feature({ geometry: new Polygon([ring]), ref: "Gbg/1" })],
    });

    const [feature] = extractFeaturesFromSource(source);
    expect(feature?.geometry.type).toBe("Polygon");
    expect(feature?.properties).toEqual({ ref: "Gbg/1" });
    const first =
      (feature?.geometry as { coordinates: number[][][] } | undefined)
        ?.coordinates[0]?.[0] ?? [];
    expect(first[0]).toBeCloseTo(4, 6);
    expect(first[1]).toBeCloseTo(51, 6);
  });

  it("honours explicit source and target projections", () => {
    const source = new VectorSource({
      features: [new Feature({ geometry: new Point([4.4, 51.2]) })],
    });
    const [feature] = extractFeaturesFromSource(
      source,
      "EPSG:4326",
      "EPSG:4326",
    );
    expect(feature ? coordinatesOf(feature) : []).toEqual([4.4, 51.2]);
  });
});
