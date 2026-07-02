/**
 * lib/bot/tools.ts
 * Tool schemas for LLM function calling — Predictive A&R bot tools.
 * Compatible with OpenAI function-calling format.
 */

// ---------------------------------------------------------------------------
// Tool type definitions
// ---------------------------------------------------------------------------

export type SearchArtistsTool = {
  name: "search_artists";
  arguments: {
    /** Minimum heat score (1–10) */
    min_heat?: number;
    /** Minimum breakout probability (0–1) */
    min_breakout_prob?: number;
    /** Maximum monthly listener count */
    max_monthly_listeners?: number;
    /** Primary genre filter (e.g. "pop", "hip-hop") */
    genre?: string;
    /** ISO-2 country code filter (e.g. "US", "GB") */
    country?: string;
    /** Sort field: "heat_score" | "breakout_prob_30d" | "listeners_growth_30d" */
    order_by?: "heat_score" | "breakout_prob_30d" | "listeners_growth_30d";
    /** Max number of results to return (1–500, default 20) */
    limit?: number;
    /** Score date in YYYY-MM-DD format (defaults to latest available) */
    score_date?: string;
  };
};

export type ExplainArtistTool = {
  name: "explain_artist";
  arguments: {
    /** Internal artist ID */
    artist_id: number;
    /** Score date in YYYY-MM-DD format (defaults to latest) */
    score_date?: string;
  };
};

export type PlaylistsToPitchTool = {
  name: "playlists_to_pitch";
  arguments: {
    /** Internal artist ID to find matching playlists for */
    artist_id: number;
    /** Max number of playlist recommendations (1–50, default 10) */
    limit?: number;
  };
};

export type BotTool = SearchArtistsTool | ExplainArtistTool | PlaylistsToPitchTool;

// ---------------------------------------------------------------------------
// OpenAI-compatible function definitions
// ---------------------------------------------------------------------------

export const BOT_TOOLS: Record<
  string,
  { description: string; parameters: Record<string, unknown> }
> = {
  search_artists: {
    description:
      "Search for emerging artists by A&R scores. Filters by heat score, breakout probability, " +
      "monthly listeners, genre, and country. Returns ranked artists with scoring metadata.",
    parameters: {
      type: "object",
      properties: {
        min_heat: {
          type: "number",
          minimum: 1,
          maximum: 10,
          description: "Minimum heat score (1–10). Higher = hotter artist.",
        },
        min_breakout_prob: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description: "Minimum breakout probability (0–1). E.g. 0.7 = 70% chance of breakout.",
        },
        max_monthly_listeners: {
          type: "integer",
          minimum: 0,
          description:
            "Maximum monthly listener count. Use to find undiscovered artists (e.g. 50000).",
        },
        genre: {
          type: "string",
          description: 'Primary genre (e.g. "pop", "hip-hop", "electronic", "r&b").',
        },
        country: {
          type: "string",
          description: "ISO-2 country code (e.g. 'US', 'GB', 'NG', 'BR').",
        },
        order_by: {
          type: "string",
          enum: ["heat_score", "breakout_prob_30d", "listeners_growth_30d"],
          description: "Sort field for results.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          default: 20,
          description: "Maximum number of results to return.",
        },
        score_date: {
          type: "string",
          format: "date",
          description: "Score date (YYYY-MM-DD). Defaults to most recent.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  explain_artist: {
    description:
      "Get a detailed breakdown explaining why an artist has a high breakout probability. " +
      "Returns feature contributions, score components, and a human-readable summary.",
    parameters: {
      type: "object",
      properties: {
        artist_id: {
          type: "integer",
          description: "Internal artist ID to explain.",
        },
        score_date: {
          type: "string",
          format: "date",
          description: "Score date (YYYY-MM-DD). Defaults to most recent.",
        },
      },
      required: ["artist_id"],
      additionalProperties: false,
    },
  },

  playlists_to_pitch: {
    description:
      "Get playlist pitch recommendations for an artist — playlists that match the " +
      "artist's audio profile and where a placement would be most impactful.",
    parameters: {
      type: "object",
      properties: {
        artist_id: {
          type: "integer",
          description: "Internal artist ID to find playlist recommendations for.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          default: 10,
          description: "Max number of playlist recommendations.",
        },
      },
      required: ["artist_id"],
      additionalProperties: false,
    },
  },
};

// ---------------------------------------------------------------------------
// OpenAI-format tools array (for use with chat completions API)
// ---------------------------------------------------------------------------

export const OPENAI_BOT_TOOLS = Object.entries(BOT_TOOLS).map(([name, def]) => ({
  type: "function" as const,
  function: {
    name,
    description: def.description,
    parameters: def.parameters,
  },
}));

// ---------------------------------------------------------------------------
// Anthropic-format tools array (for use with the Messages API `tools` param)
// ---------------------------------------------------------------------------

export const ANTHROPIC_BOT_TOOLS = Object.entries(BOT_TOOLS).map(([name, def]) => ({
  name,
  description: def.description,
  input_schema: def.parameters,
}));
