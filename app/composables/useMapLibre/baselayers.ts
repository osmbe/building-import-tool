import type { AddLayerObject, RasterSourceSpecification, VectorSourceSpecification, BackgroundLayerSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import blankStyle from "./baselayers/blank.json"
import bruOrthoWMSStyle from "./baselayers/bru-ortho-wms.json";
import osmbeStyle from "./baselayers/osmbe.json";
import vlaOrthoWMTSStyle from "./baselayers/vla-ortho-wmts.json";
import walOrthoWMSStyle from "./baselayers/wal-ortho-wms.json";

type SourceConfig = {
  label: string;
  comment?: string;
  title?: string;
  style: StyleSpecification | string | null;
}

export const baselayers: Record<string, SourceConfig> = {
  // Blank
  blank: {
    label: "Blank",
    style: blankStyle as StyleSpecification,
  },
  // OpenStreetMap Belgium
  osmbe: {
    label: "OSM",
    comment: "BE",
    title: "OpenStreetMap Belgium TileServers",
    style: osmbeStyle as StyleSpecification

  },
  // OpenFreeMap
  openfreemap: {
    label: "OpenFreeMap",
    style: "https://tiles.openfreemap.org/styles/liberty"
  },
  // Vlaanderen (Flanders) orthophotos
  "vla-ortho-wmts": {
    label: "Flanders",
    comment: "latest",
    title: "Orthophoto Flanders — Digitaal Vlaanderen (OFW, always latest)",
    style: vlaOrthoWMTSStyle as StyleSpecification
  },
  // Wallonie (Wallonia) orthophotos
  "wal-ortho-wms": {
    label: "Wallonia",
    comment: "latest",
    title: "Orthophoto Wallonia — Service Public de Wallonie (ORTHO_LATEST, always latest)",
    style: walOrthoWMSStyle as StyleSpecification
  },
  // Bruxelles/Brussel (Brussels) orthophotos
  "bru-ortho-wms": {
    label: "Brussels",
    comment: "latest",
    title: "Orthophoto Brussels — Paradigm (Ortho, always latest)",
    style: bruOrthoWMSStyle as StyleSpecification
  }
};
