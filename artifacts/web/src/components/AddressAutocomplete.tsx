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
    house_number?: string;
    road?: string;
    suburb?: string;
    town?: string;
    city?: string;
    village?: string;
    hamlet?: string;
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
 * Extract the best possible street address from a Nominatim result.
 *
 * Priority order:
 *  1. address.house_number + address.road   (ideal — Nominatim gave us both)
 *  2. display_name first segment starts with a digit  (e.g. "42, Smith Street, …")
 *  3. address.road only  (street-level result — no number found)
 *  4. display_name first segment as fallback
 */
function parseNominatimAddress(result: NominatimResult): AddressFields {
  const a = result.address;
  let siteAddress: string;

  if (a.house_number && a.road) {
    // Best case: Nominatim returned both fields explicitly.
    siteAddress = `${a.house_number} ${a.road}`;
  } else {
    // Try to pull the number from display_name.
    // Nominatim formats specific addresses as "42, Smith Street, Suburb, …"
    // or sometimes "42 Smith Street, Suburb, …" (no comma after number).
    const segments = result.display_name.split(",").map(s => s.trim());
    const first = segments[0];

    // Case A: first segment is just a number and second segment is road
    if (/^\d+[A-Za-z]?$/.test(first) && segments[1]) {
      siteAddress = `${first} ${segments[1]}`;
    }
    // Case B: first segment starts with a number (e.g. "42 Smith Street")
    else if (/^\d/.test(first)) {
      siteAddress = first;
    }
    // Case C: fall back to road-only (user will need to type number in)
    else if (a.road) {
      siteAddress = a.road;
    }
    // Case D: last resort
    else {
      siteAddress = first;
    }
  }

  const suburb = a.suburb ?? a.town ?? a.city ?? a.village ?? a.hamlet ?? "";
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
      // When the query starts with a digit the user is searching for a
      // specific numbered address — restrict results to address-level features
      // so Nominatim returns house_number instead of just the street.
      if (/^\d/.test(q.trim())) {
        url.searchParams.set("featuretype", "address");
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
