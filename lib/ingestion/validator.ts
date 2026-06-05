import type { ArtistMetrics } from "./types";

export interface ValidationViolation {
  field: string;
  value: unknown;
  rule: string;
}

export interface ValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
}

type Rule = {
  field: keyof ArtistMetrics;
  label: string;
  check: (v: unknown) => boolean;
};

const RULES: Rule[] = [
  {
    field: "artistId",
    label: "artistId must be a positive integer",
    check: (v) => typeof v === "number" && Number.isInteger(v) && (v as number) > 0,
  },
  {
    field: "date",
    label: "date must be YYYY-MM-DD",
    check: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v as string),
  },
  {
    field: "streamVelocity",
    label: "streamVelocity must be in [-1, 100] or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= -1 && (v as number) <= 100),
  },
  {
    field: "saveRate",
    label: "saveRate must be in [0, 1] or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0 && (v as number) <= 1),
  },
  {
    field: "skipRate",
    label: "skipRate must be in [0, 1] or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0 && (v as number) <= 1),
  },
  {
    field: "followerGrowth",
    label: "followerGrowth must be in [-1, 100] or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= -1 && (v as number) <= 100),
  },
  {
    field: "playlistRate",
    label: "playlistRate must be ≥ 0 or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0),
  },
  {
    field: "ugcCount",
    label: "ugcCount must be a non-negative integer or null",
    check: (v) =>
      v === null ||
      (typeof v === "number" && Number.isInteger(v) && (v as number) >= 0),
  },
  {
    field: "tiktokUses7d",
    label: "tiktokUses7d must be ≥ 0 or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0),
  },
  {
    field: "radioSpins",
    label: "radioSpins must be ≥ 0 or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0),
  },
  {
    field: "chartRank",
    label: "chartRank must be in [1, 200] or null",
    check: (v) =>
      v === null ||
      (typeof v === "number" &&
        Number.isInteger(v) &&
        (v as number) >= 1 &&
        (v as number) <= 200),
  },
  {
    field: "preSaveCount",
    label: "preSaveCount must be ≥ 0 or null",
    check: (v) => v === null || (typeof v === "number" && (v as number) >= 0),
  },
];

export function validateArtistMetrics(m: ArtistMetrics): ValidationResult {
  const violations: ValidationViolation[] = [];
  for (const rule of RULES) {
    const val = m[rule.field];
    if (!rule.check(val)) {
      violations.push({ field: rule.field, value: val, rule: rule.label });
    }
  }
  return { valid: violations.length === 0, violations };
}
