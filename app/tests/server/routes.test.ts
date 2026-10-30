import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { OverpassError } from "~/server/utils/overpass";
import { asHandler, createEvent, expectHttpError, stubNitro } from "./nitro";

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  writeFile: vi.fn(),
}));
const db = vi.hoisted(() => ({ queryGrb: vi.fn() }));
const overpass = vi.hoisted(() => ({ fetchOverpassBuildings: vi.fn() }));

vi.mock("fs", () => ({ default: { promises: fsMock }, promises: fsMock }));
vi.mock("fs/promises", () => ({
  default: { readFile: fsMock.readFile },
  readFile: fsMock.readFile,
}));
vi.mock("../../server/utils/db", () => db);
vi.mock("~/server/utils/overpass", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/overpass")>()),
  fetchOverpassBuildings: overpass.fetchOverpassBuildings,
}));

const flushPromises = async () =>
  new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  stubNitro();
  for (const fn of Object.values(fsMock)) fn.mockReset();
  db.queryGrb.mockReset();
  overpass.fetchOverpassBuildings.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  const load = async () => asHandler(await import("~/server/api/health.get"));

  it("reports healthy", async () => {
    expect(await (await load())(createEvent())).toMatchObject({
      service: "be2osm-nuxt",
      status: "healthy",
    });
  });

  it("reports unhealthy with 503 when a check throws", async () => {
    vi.spyOn(process, "uptime").mockImplementation(() => {
      throw new Error("no uptime");
    });
    const event = createEvent();
    expect(await (await load())(event)).toMatchObject({
      error: "no uptime",
      status: "unhealthy",
    });
    expect(event.status).toBe(503);
  });

  it("reports an unknown error for non-Error failures", async () => {
    vi.spyOn(process, "uptime").mockImplementation(() => {
      throw "boom";
    });
    expect(await (await load())(createEvent())).toMatchObject({
      error: "Unknown error",
    });
  });
});

describe("GET /api/health/ready", () => {
  const load = async () =>
    asHandler(await import("~/server/api/health/ready.get"));

  it("reports the build SHA and the applied migrations of every scope", async () => {
    stubNitro({ gitSha: "abc123" });
    db.queryGrb
      .mockResolvedValueOnce([{ schema: "grb" }, { schema: "public" }])
      .mockResolvedValueOnce([{ version: "001_a" }, { version: "002_b" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const event = createEvent();
    expect(await (await load())(event)).toEqual({
      migrations: { common: [], grb: ["001_a", "002_b"] },
      ready: true,
      sha: "abc123",
    });
    expect(event.status).toBeUndefined();
    expect(db.queryGrb).toHaveBeenCalledWith(
      'SELECT version FROM "grb".schema_migrations ORDER BY version',
    );
  });

  it("checks that every candidates view the app reads exists", async () => {
    db.queryGrb.mockResolvedValue([]);
    await (
      await load()
    )(createEvent());
    expect(db.queryGrb).toHaveBeenLastCalledWith(
      expect.stringContaining("to_regclass"),
      [
        [
          "grb.candidates",
          "grb.knw_candidates",
          "picc.candidates",
          "urbis.candidates",
        ],
      ],
    );
  });

  it("is not ready (503) when a candidates view is missing, so a deploy rolls back", async () => {
    stubNitro({ gitSha: "abc123" });
    db.queryGrb
      .mockResolvedValueOnce([{ schema: "grb" }])
      .mockResolvedValueOnce([{ version: "003_x" }])
      .mockResolvedValueOnce([
        { view: "grb.candidates" },
        { view: "urbis.candidates" },
      ]);
    const event = createEvent();
    expect(await (await load())(event)).toEqual({
      error:
        "missing views: grb.candidates, urbis.candidates (run the migrations)",
      migrations: { grb: ["003_x"] },
      ready: false,
      sha: "abc123",
    });
    expect(event.status).toBe(503);
  });

  it('reports "dev" when the build has no SHA', async () => {
    db.queryGrb.mockResolvedValue([]);
    expect(await (await load())(createEvent())).toMatchObject({
      migrations: {},
      ready: true,
      sha: "dev",
    });
  });

  it("is not ready (503) when the database does not answer", async () => {
    stubNitro({ gitSha: "abc123" });
    db.queryGrb.mockRejectedValue(new Error("connection refused"));
    const event = createEvent();
    expect(await (await load())(event)).toEqual({
      error: "connection refused",
      ready: false,
      sha: "abc123",
    });
    expect(event.status).toBe(503);
  });

  it("reports an unknown error for non-Error failures", async () => {
    db.queryGrb.mockRejectedValue("boom");
    expect(await (await load())(createEvent())).toMatchObject({
      error: "Unknown error",
      ready: false,
    });
  });
});

describe("GET /api/meta/data-dates", () => {
  it("reads the import dates through the GRB pool", async () => {
    db.queryGrb.mockResolvedValue([{ imported_at: "2026-01-02T03:04:05Z" }]);
    const handler = asHandler(await import("~/server/api/meta/data-dates.get"));
    expect(await handler(createEvent())).toEqual({
      grb: "2026-01-02T03:04:05.000Z",
      knw: "2026-01-02T03:04:05.000Z",
      picc: "2026-01-02T03:04:05.000Z",
      urbis: "2026-01-02T03:04:05.000Z",
    });
    expect(db.queryGrb).toHaveBeenCalledWith(
      "SELECT max(imported_at) AS imported_at FROM picc.import_meta",
    );
  });
});

describe("POST /api/buildings/osm-live", () => {
  const load = async () =>
    asHandler(await import("~/server/api/buildings/osm-live.post"));
  const BOUNDS = [1, 2, 3, 4];

  it.each([[undefined], [[1, 2, 3]], [[1, 2, 3, "4"]]])(
    "answers 400 for bounds %j",
    async (bounds) => {
      const event = createEvent({ body: { bounds } });
      await (
        await load()
      )(event);
      expect(event.sentError?.statusCode).toBe(400);
      expect(overpass.fetchOverpassBuildings).not.toHaveBeenCalled();
    },
  );

  it("returns the live footprints as a FeatureCollection", async () => {
    const feature = {
      geometry: { coordinates: [], type: "Polygon" },
      properties: { osm_id: "way/1" },
      type: "Feature",
    };
    overpass.fetchOverpassBuildings.mockResolvedValue({
      features: [feature],
      totalOsm: 1,
    });
    const result = await (
      await load()
    )(createEvent({ body: { bounds: BOUNDS } }));
    expect(overpass.fetchOverpassBuildings).toHaveBeenCalledWith(BOUNDS);
    expect(result).toEqual({
      features: [feature],
      stats: { totalOsm: 1 },
      type: "FeatureCollection",
    });
  });

  it.each([
    [new OverpassError("rate limited", 429), 429, "rate limited"],
    [new Error("socket hang up"), 500, "socket hang up"],
    ["weird", 500, "Live OSM request failed"],
  ])(
    "maps a %s failure to its status",
    async (error, statusCode, statusMessage) => {
      overpass.fetchOverpassBuildings.mockRejectedValue(error);
      const event = createEvent({ body: { bounds: BOUNDS } });
      await (
        await load()
      )(event);
      expect(event.sentError).toMatchObject({ statusCode, statusMessage });
    },
  );
});

describe("GET /api/proxy/brussels-wms", () => {
  const load = async () =>
    asHandler(await import("~/server/api/proxy/brussels-wms.get"));

  it("clamps tile size, translates EPSG:3857 and drops FORMAT_OPTIONS", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const event = createEvent({
      query: {
        CRS: "EPSG:3857",
        FORMAT_OPTIONS: "dpi:180",
        LAYERS: "urbisFR",
        WIDTH: "512",
        height: "512",
      },
    });

    const body = await (await load())(event);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe(
      "https://geoservices-urbis.irisnet.be/geowebcache/service/wms",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      CRS: "EPSG:900913",
      LAYERS: "urbisFR",
      WIDTH: "256",
      height: "256",
    });
    expect(event.responseHeaders["Content-Type"]).toBe("image/png");
    expect(Buffer.isBuffer(body)).toBe(true);
    expect([...(body as Buffer)]).toEqual([1, 2, 3]);
  });

  it("defaults the content type to JPEG", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(new Uint8Array([9]), { status: 200 })),
    );
    const event = createEvent();
    await (
      await load()
    )(event);
    expect(event.responseHeaders["Content-Type"]).toBe("image/jpeg");
  });

  it("forwards an upstream error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("nope", {
            status: 503,
            statusText: "Service Unavailable",
          }),
        ),
    );
    const error = await expectHttpError((await load())(createEvent()));
    expect(error).toMatchObject({
      statusCode: 503,
      statusMessage: "Service Unavailable",
    });
  });
});

describe("POST /api/export/upload", () => {
  const load = async () =>
    asHandler(await import("~/server/api/export/upload.post"));
  const OSM_XML = '<?xml version="1.0"?><osm version="0.6"></osm>';

  beforeEach(() => {
    fsMock.readdir.mockResolvedValue([]);
  });

  it.each([[undefined], [""], [{ xml: OSM_XML }]])(
    "rejects a %j body",
    async (body) => {
      const error = await expectHttpError(
        (await load())(createEvent({ body })),
      );
      expect(error.statusCode).toBe(400);
    },
  );

  it("rejects payloads over 10 MB", async () => {
    const body = `<osm>${"x".repeat(10 * 1024 * 1024)}</osm>`;
    expect(
      (await expectHttpError((await load())(createEvent({ body })))).statusCode,
    ).toBe(413);
  });

  it("rejects text that is not OSM XML", async () => {
    const error = await expectHttpError(
      (await load())(createEvent({ body: "hello" })),
    );
    expect(error.message).toContain("Invalid OSM-XML format");
  });

  it("stores the file under a random name and returns its URL", async () => {
    const event = createEvent({
      body: OSM_XML,
      headers: { host: "be2osm.test", "x-forwarded-proto": "https" },
    });
    const result = await (await load())(event);

    expect(result.status).toBe("stored");
    expect(result.fname).toMatch(/^[a-f0-9]{32}\.osm$/);
    expect(result.url).toBe(`https://be2osm.test/exports/${result.fname}`);
    expect(fsMock.mkdir).toHaveBeenCalledWith(
      expect.stringMatching(/public[/\\]exports$/),
      { recursive: true },
    );
    const [path, content] = fsMock.writeFile.mock.calls[0] as [string, string];
    expect(path.endsWith(result.fname)).toBe(true);
    expect(path).not.toContain(".output");
    expect(content).toBe(OSM_XML);
  });

  it("defaults to http://localhost:3000 in development and https in production", async () => {
    expect((await (await load())(createEvent({ body: "<osm/>" }))).url).toMatch(
      /^http:\/\/localhost:3000\/exports\//,
    );

    vi.stubEnv("NODE_ENV", "production");
    const result = await (await load())(createEvent({ body: "<osm/>" }));
    expect(result.url).toMatch(/^https:\/\/localhost:3000\/exports\//);
    expect(fsMock.mkdir.mock.calls.at(-1)?.[0]).toMatch(
      /\.output[/\\]public[/\\]exports$/,
    );
  });

  it("answers 500 when the file cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fsMock.writeFile.mockRejectedValue(new Error("EACCES"));
    const error = await expectHttpError(
      (await load())(createEvent({ body: OSM_XML })),
    );
    expect(error.statusCode).toBe(500);
  });

  it("deletes export files older than an hour, leaving other files alone", async () => {
    const now = Date.now();
    fsMock.readdir.mockResolvedValue([
      "abc.osm",
      "notes.txt",
      "def.osm",
      "old.osm",
    ]);
    fsMock.stat.mockImplementation(async (path: string) => ({
      mtimeMs: path.endsWith("abc.osm") ? now - 2 * 60 * 60 * 1000 : now,
    }));
    fsMock.unlink.mockRejectedValue(new Error("already gone"));

    await (
      await load()
    )(createEvent({ body: OSM_XML }));
    await flushPromises();

    // "old.osm" is not a generated name (not hex), "notes.txt" is not an export
    expect(fsMock.stat).toHaveBeenCalledTimes(2);
    expect(fsMock.unlink).toHaveBeenCalledTimes(1);
    expect(String(fsMock.unlink.mock.calls[0]?.[0])).toMatch(/abc\.osm$/);
  });

  it("ignores a cleanup failure", async () => {
    fsMock.readdir.mockRejectedValue(new Error("ENOENT"));
    const result = await (await load())(createEvent({ body: OSM_XML }));
    await flushPromises();
    expect(result.status).toBe("stored");
  });
});

describe("GET /exports/:filename", () => {
  const load = async () =>
    asHandler(await import("~/server/routes/exports/[filename].get"));
  const FILE = "abc123.osm";

  it.each([[undefined], ["../secret.osm"], ["ABC.osm"], ["abc.xml"]])(
    "rejects the filename %j",
    async (name) => {
      const params: Record<string, string> =
        name === undefined ? {} : { filename: name };
      const error = await expectHttpError(
        (await load())(createEvent({ params })),
      );
      expect(error.statusCode).toBe(400);
      expect(fsMock.readFile).not.toHaveBeenCalled();
    },
  );

  it("serves the export as inline XML", async () => {
    fsMock.readFile.mockResolvedValue("<osm/>");
    const event = createEvent({ params: { filename: FILE } });
    expect(await (await load())(event)).toBe("<osm/>");
    expect(String(fsMock.readFile.mock.calls[0]?.[0])).toMatch(
      /public[/\\]exports[/\\]abc123\.osm$/,
    );
    expect(event.responseHeaders).toEqual({
      "Content-Disposition": `inline; filename="${FILE}"`,
      "Content-Type": "application/xml",
    });
  });

  it("reads from .output in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fsMock.readFile.mockResolvedValue("<osm/>");
    await (
      await load()
    )(createEvent({ params: { filename: FILE } }));
    expect(String(fsMock.readFile.mock.calls[0]?.[0])).toContain(".output");
  });

  it("answers 404 for a missing (expired) export", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("missing"), { code: "ENOENT" }),
    );
    expect(
      (
        await expectHttpError(
          (await load())(createEvent({ params: { filename: FILE } })),
        )
      ).statusCode,
    ).toBe(404);
  });

  it("answers 500 for other read errors", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("denied"), { code: "EACCES" }),
    );
    expect(
      (
        await expectHttpError(
          (await load())(createEvent({ params: { filename: FILE } })),
        )
      ).statusCode,
    ).toBe(500);
  });
});
