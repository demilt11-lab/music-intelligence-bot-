"use client";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { search as searchApi } from "@/lib/api/client";
import type { AlertFormData } from "@/hooks/useAlerts";
import type { SearchResult } from "@/types";

const schema = z.object({
  track_id: z.number().int().positive(),
  track_name: z.string().min(1),
  threshold_type: z.enum(["viral_score", "momentum", "breakout"]),
  threshold_value: z.number().min(0).max(100),
});

interface Props {
  onSubmit: (data: AlertFormData) => void;
  isLoading?: boolean;
}

export function AlertForm({ onSubmit, isLoading }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AlertFormData>({
    resolver: zodResolver(schema),
    defaultValues: { threshold_type: "viral_score", threshold_value: 75 },
  });

  const thresholdType = watch("threshold_type");

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await searchApi(query, "track", 5).catch(() => []);
      setSuggestions(res);
      setShowSuggestions(true);
    }, 300);
  }, [query]);

  function pickTrack(r: SearchResult) {
    setQuery(r.name);
    setValue("track_id", Number(r.id));
    setValue("track_name", r.name);
    setShowSuggestions(false);
  }

  const maxVal = thresholdType === "breakout" ? 1 : 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Alert</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search for a song..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              className="pl-9"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                {suggestions.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pickTrack(r)}
                    className="w-full text-left px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800"
                  >
                    <span className="font-medium">{r.name}</span>
                    {r.artistName && <span className="text-zinc-500 ml-2">{r.artistName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Alert type</label>
            <Select
              value={thresholdType}
              onValueChange={(v) => setValue("threshold_type", v as AlertFormData["threshold_type"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viral_score">Viral Score</SelectItem>
                <SelectItem value="momentum">Momentum</SelectItem>
                <SelectItem value="breakout">Breakout Probability</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">
              Threshold value (0–{maxVal})
            </label>
            <Input
              type="number"
              min={0}
              max={maxVal}
              step={thresholdType === "breakout" ? 0.01 : 1}
              {...register("threshold_value", { valueAsNumber: true })}
            />
            {errors.threshold_value && (
              <p className="text-rose-400 text-xs mt-1">{errors.threshold_value.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create Alert"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
