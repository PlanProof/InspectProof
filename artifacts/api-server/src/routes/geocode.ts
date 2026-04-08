import { Router } from "express";

const router = Router();

const STATE_ABBREVS: Record<string, string> = {
  "new south wales": "NSW",
  "victoria": "VIC",
  "queensland": "QLD",
  "south australia": "SA",
  "western australia": "WA",
  "tasmania": "TAS",
  "northern territory": "NT",
  "australian capital territory": "ACT",
};

function abbreviateState(name?: string): string {
  if (!name) return "";
  const lower = name.toLowerCase();
  return STATE_ABBREVS[lower] ?? name;
}

router.get("/geocode", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) {
    return res.json({ suggestions: [] });
  }

  const token = process.env.MAPBOX_PUBLIC_KEY;
  if (!token) {
    return res.status(503).json({ error: "geocoding_not_configured" });
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", q);
  url.searchParams.set("country", "au");
  url.searchParams.set("limit", "8");
  url.searchParams.set("types", "address");
  url.searchParams.set("access_token", token);

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      headers: { "Accept-Language": "en" },
    });
  } catch {
    return res.status(502).json({ error: "geocoding_upstream_error" });
  }

  if (!upstream.ok) {
    return res.status(502).json({ error: "geocoding_upstream_error" });
  }

  const data = await upstream.json() as any;

  const suggestions = (data.features ?? []).map((f: any) => {
    const props = f.properties ?? {};
    const ctx = props.context ?? {};

    const addrName: string = ctx.address?.name ?? props.name ?? "";
    const suburb: string =
      ctx.locality?.name ?? ctx.district?.name ?? ctx.place?.name ?? "";

    let state = "";
    if (ctx.region?.region_code_full) {
      state = ctx.region.region_code_full.replace(/^AU-/, "");
    } else if (ctx.region?.region_code) {
      state = ctx.region.region_code;
    } else if (ctx.region?.name) {
      state = abbreviateState(ctx.region.name);
    }

    const postcode: string = ctx.postcode?.name ?? "";
    const displayName: string = props.full_address ?? "";

    return { siteAddress: addrName, suburb, state, postcode, displayName };
  });

  return res.json({ suggestions });
});

export default router;
