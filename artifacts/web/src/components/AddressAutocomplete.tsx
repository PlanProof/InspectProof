import React, { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AddressFields {
  siteAddress: string;
  suburb: string;
  state: string;
  postcode: string;
}

interface MapboxSuggestion {
  siteAddress: string;
  suburb: string;
  state: string;
  postcode: string;
  displayName: string;
}

interface AddressAutocompleteProps {
  value?: AddressFields;
  onChange: (fields: AddressFields) => void;
  compact?: boolean;
}

function hasAddressContent(f?: AddressFields | null): f is AddressFields {
  return !!(f && (f.siteAddress || f.suburb || f.state || f.postcode));
}

export function AddressAutocomplete({ value, onChange, compact = false }: AddressAutocompleteProps) {
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState(value?.siteAddress ?? "");
  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<AddressFields | null>(hasAddressContent(value) ? value : null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (hasAddressContent(value)) {
      setSelected(value);
      if (value.siteAddress && !query) setQuery(value.siteAddress);
    } else {
      setSelected(null);
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
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error("geocode_error");
      const data: { suggestions: MapboxSuggestion[] } = await res.json();
      setSuggestions(data.suggestions ?? []);
      setOpen((data.suggestions ?? []).length > 0);
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
    debounceRef.current = setTimeout(() => search(q), 300);
  };

  const handleSelect = (s: MapboxSuggestion) => {
    const fields: AddressFields = {
      siteAddress: s.siteAddress,
      suburb: s.suburb,
      state: s.state,
      postcode: s.postcode,
    };
    setSelected(fields);
    setQuery(fields.siteAddress);
    setSuggestions([]);
    setOpen(false);
    onChange(fields);
  };

  const handleSelectedAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    const next = { ...(selected!), siteAddress: val };
    setSelected(next);
    onChange(next);
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
        <div className="space-y-1.5">
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
      <div ref={containerRef} className="relative">
        <Label className={labelCls}>Site Address</Label>
        {!selected && (
          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
            Start with the street number — e.g. <span className="font-medium">42 Smith Street, Adelaide</span>
          </p>
        )}
        <div className="relative mt-1.5">
          {selected ? (
            <CheckCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />
          ) : (
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          )}
          <Input
            className={cn("pl-9", inputCls, selected && !selected.siteAddress && "border-amber-400 focus-visible:ring-amber-400")}
            placeholder="e.g. 42 Smith Street, Adelaide SA"
            value={query}
            onChange={selected ? handleSelectedAddressChange : handleQueryChange}
            onFocus={() => { if (!selected && suggestions.length > 0) setOpen(true); }}
            autoComplete="off"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 rounded-full border-2 border-secondary border-t-transparent animate-spin" />
            </div>
          )}
        </div>

        {!selected && open && suggestions.length > 0 && (
          <ul className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-popover shadow-xl overflow-hidden max-h-64 overflow-y-auto">
            {suggestions.map((s, i) => {
              const mainLine = [s.siteAddress, s.suburb].filter(Boolean).join(", ");
              const secondLine = [s.state, s.postcode].filter(Boolean).join(" ");
              return (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
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
        <>
          {!selected.siteAddress && (
            <p className="text-[11px] text-amber-600 -mt-1">Street number missing — type it in the field above</p>
          )}
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
          <button
            type="button"
            onClick={() => { setSelected(null); setQuery(""); setSuggestions([]); onChange({ siteAddress: "", suburb: "", state: "", postcode: "" }); }}
            className="text-xs text-muted-foreground hover:text-secondary transition-colors"
          >
            ← Search for a different address
          </button>
        </>
      )}

      {!selected && (
        <button
          type="button"
          onClick={() => setManual(true)}
          className="text-xs text-muted-foreground hover:text-secondary transition-colors"
        >
          Can't find your address? Enter it manually →
        </button>
      )}
    </div>
  );
}
