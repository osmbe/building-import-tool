export default defineEventHandler(async (event) => {
  const query = getQuery(event) as Record<string, string>;

  const targetUrl = new URL(
    "https://geoservices-urbis.irisnet.be/geowebcache/service/wms",
  );

  for (const [key, value] of Object.entries(query)) {
    const k = key.toUpperCase();
    // GeoWebCache cached tileset is 256×256 only — clamp HiDPI tile requests
    if (k === "WIDTH" || k === "HEIGHT") {
      targetUrl.searchParams.set(key, "256");
      continue;
    }
    // GeoWebCache only has EPSG:900913 configured (not EPSG:3857, despite being identical)
    const translated = String(value).replace(/EPSG:3857/g, "EPSG:900913");
    targetUrl.searchParams.set(key, translated);
  }

  // GeoWebCache doesn't understand the FORMAT_OPTIONS OpenLayers adds for HiDPI screens
  targetUrl.searchParams.delete("FORMAT_OPTIONS");

  const response = await fetch(targetUrl.toString());

  if (!response.ok)
    throw createError({
      statusCode: response.status,
      statusMessage: response.statusText,
    });

  const data = await response.arrayBuffer();
  setResponseHeader(
    event,
    "Content-Type",
    response.headers.get("content-type") || "image/jpeg",
  );
  return Buffer.from(data);
});
