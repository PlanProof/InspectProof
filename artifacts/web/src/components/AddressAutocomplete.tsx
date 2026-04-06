import React, { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddressFields {
  siteAddress: string;
  suburb: string;
  state: string;
  postcode: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  address: {
    // House number variants
    house_number?: string;
    house?: string;
    // Road/street variants — different states use different keys
    road?: string;
    pedestrian?: string;
    path?: string;
    footway?: string;
    cycleway?: string;
    residential?: string;
    living_street?: string;
    service?: string;
    // Suburb/locality variants — SA and others differ
    suburb?: string;
    neighbourhood?: string;
    quarter?: string;
    locality?: string;
    city_district?: string;
    // Fallback locality fields
    town?: string;
    city?: string;
    village?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    postcode?: string;
  };
}

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

function abbreviateState(state?: string): string {
  if (!state) return "";
  const lower = state.toLowerCase();
  return STATE_ABBREVS[lower] ?? state.toUpperCase().slice(0, 3);
}

/**
 * Resolve the street name from whichever Nominatim field is populated.
 * Different Australian states tag roads differently in OpenStreetMap.
 */
function resolveRoad(a: NominatimResult["address"]): string | undefined {
  return (
    a.road ??
    a.pedestrian ??
    a.path ??
    a.footway ??
    a.cycleway ??
    a.residential ??
    a.living_street ??
    a.service
  );
}

/**
 * Resolve the suburb/locality from whichever Nominatim field is populated.
 * SA often uses locality or neighbourhood rather than suburb.
 */
function resolveSuburb(a: NominatimResult["address"]): string {
  return (
    a.suburb ??
    a.neighbourhood ??
    a.quarter ??
    a.locality ??
    a.city_district ??
    a.town ??
    a.city ??
    a.village ??
    a.hamlet ??
    a.county ??
    ""
  );
}

/**
 * Extract the best possible street address from a Nominatim result.
 *
 * Priority order:
 *  1. house_number/house + resolved road field (ideal — structured data present)
 *  2. road field already starts with a digit (Nominatim embedded number in road)
 *  3. display_name first segment is just a number → combine with second segment
 *  4. display_name first segment starts with a digit (e.g. "42 Smith Street")
 *  5. road-only fallback (no number found — user can type it in)
 *  6. display_name first segment as last resort
 */
function parseNominatimAddress(result: NominatimResult): AddressFields {
  const a = result.address;
  const road = resolveRoad(a);
  const houseNum = a.house_number ?? a.house;

  let siteAddress: string;

  if (houseNum && road) {
    // Best case: structured fields have both number and street
    siteAddress = `${houseNum} ${road}`;
  } else if (road && /^\d/.test(road)) {
    // Road field already contains the house number (e.g. "42 Smith Street")
    siteAddress = road;
  } else {
    // Fall back to parsing display_name
    // Nominatim formats specific addresses as:
    //   "42, Smith Street, Suburb, …"  or  "42 Smith Street, Suburb, …"
    const segments = result.display_name.split(",").map(s => s.trim());
    const first = segments[0];

    // Case A: first segment is just a number — combine with second segment (road)
    if (/^\d+[A-Za-z]?$/.test(first) && segments[1]) {
      siteAddress = `${first} ${segments[1]}`;
    }
    // Case B: first segment starts with a digit (e.g. "42 Smith Street")
    else if (/^\d/.test(first)) {
      siteAddress = first;
    }
    // Case C: fall back to road name (user will type number in)
    else if (road) {
      siteAddress = road;
    }
    // Case D: last resort
    else {
      siteAddress = first;
    }
  }

  const suburb = resolveSuburb(a);
  const state = abbreviateState(a.state);
  const postcode = a.postcode ?? "";
  return { siteAddress, suburb, state, postcode };
}

interface AddressAutocompleteProps {
  value?: AddressFields;
  onChange: (fields: AddressFields) => void;
  compact?: boolean;
}

export function AddressAutocomplete({ value, onChange, compact = false }: AddressAutocompleteProps) {
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState(value?.siteAddress ?? "");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AddressFields | null>(value ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (value) {
      setSelected(value);
      if (value.siteAddress && !query) setQuery(value.siteAddress);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("countrycodes", "au");
      url.searchParams.set("limit", "8");
      // When the query starts with a digit the user is typing a specific
      // numbered address — use layer=address so Nominatim returns address-level
      // features (which carry house_number) rather than street-level results.
      // Note: layer= is the correct Nominatim 4.x parameter for this purpose.
      if (/^\d/.test(q.trim())) {
        url.searchParams.set("layer", "address");
      }
      const res = await fetch(url.toString(), {
        signal: abortRef.current.signal,
        headers: { "Accept-Language": "en" },
      });
      const data: NominatimResult[] = await res.json();
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelected(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  };

  const handleSelect = (result: NominatimResult) => {
    const fields = parseNominatimAddress(result);
    setSelected(fields);
    setQuery(fields.siteAddress + (fields.suburb ? `, ${fields.suburb}` : ""));
    setSuggestions([]);
    setOpen(false);
    onChange(fields);
  };

  const handleManualChange = (field: keyof AddressFields, val: string) => {
    const next = { ...(selected ?? { siteAddress: "", suburb: "", state: "", postcode: "" }), [field]: val };
    setSelected(next);
    onChange(next);
  };

  const labelCls = compact ? "text-xs" : "text-sm font-medium";
  const inputCls = compact ? "h-8 text-sm" : "";

  if (manual) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          Manual entry — address is unverified
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className={labelCls}>Site Address</Label>
          <Input
            className={inputCls}
            placeholder="e.g. 42 Smith Street"
            value={selected?.siteAddress ?? ""}
            onChange={e => handleManualChange("siteAddress", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className={labelCls}>Suburb</Label>
            <Input
              className={inputCls}
              value={selected?.suburb ?? ""}
              onChange={e => handleManualChange("suburb", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className={labelCls}>State</Label>
              <Input
                className={inputCls}
                placeholder="NSW"
                value={selected?.state ?? ""}
                onChange={e => handleManualChange("state", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={labelCls}>Postcode</Label>
              <Input
                className={inputCls}
                value={selected?.postcode ?? ""}
                onChange={e => handleManualChange("postcode", e.target.value)}
              />
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setManual(false); setQuery(""); setSelected(null); onChange({ siteAddress: "", suburb: "", state: "", postcode: "" }); }}
          className="text-xs text-secondary hover:underline"
        >
          ← Search for address instead
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="relative col-span-2">
        <Label className={labelCls}>Site Address</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
          Start with the street number for best results — e.g. <span className="font-medium">42 Smith Street, Sydney</span>
        </p>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className={cn("pl-9", inputCls)}
            placeholder="e.g. 42 Smith Street, Sydney NSW"
            value={query}
            onChange={handleQueryChange}
            onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
            autoComplete="off"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map(r => {
              const parsed = parseNominatimAddress(r);
              const mainLine = [parsed.siteAddress, parsed.suburb].filter(Boolean).join(", ");
              const secondLine = [parsed.state, parsed.postcode].filter(Boolean).join(" ");
              return (
                <li key={r.place_id}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleSelect(r); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/40 last:border-0"
                  >
                    <div className="text-sm font-medium text-sidebar truncate">{mainLine}</div>
                    {secondLine && <div className="text-xs text-muted-foreground truncate">{secondLine}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className={labelCls}>Street Address</Label>
            <Input
              className={inputCls}
              placeholder="e.g. 42 Smith Street"
              value={selected.siteAddress}
              onChange={e => {
                const next = { ...selected, siteAddress: e.target.value };
                setSelected(next);
                onChange(next);
              }}
            />
            {!selected.siteAddress && (
              <p className="text-[11px] text-amber-600">Street number missing — type it in above</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={labelCls}>Suburb</Label>
              <Input className={cn(inputCls, "bg-muted/30")} value={selected.suburb} readOnly />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className={labelCls}>State</Label>
                <Input className={cn(inputCls, "bg-muted/30")} value={selected.state} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label className={labelCls}>Postcode</Label>
                <Input className={cn(inputCls, "bg-muted/30")} value={selected.postcode} readOnly />
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setManual(true)}
        className="text-xs text-muted-foreground hover:text-secondary transition-colors"
      >
        Can't find your address? Enter it manually →
      </button>
    </div>
  );
}
