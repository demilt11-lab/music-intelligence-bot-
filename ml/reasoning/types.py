"""
Shared types for the A&R reasoning engine.
All outputs are fully typed and serializable to JSON for API consumption.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class EvidenceStrength(str, Enum):
    STRONG   = "strong"    # direct measurement, reliable source
    MODERATE = "moderate"  # inferred or indirect
    WEAK     = "weak"      # proxy or estimated
    ABSENT   = "absent"    # data missing entirely


class EvidenceType(str, Enum):
    FACT        = "fact"        # directly observed in data
    INFERENCE   = "inference"   # logically derived from facts
    SPECULATION = "speculation" # plausible but not data-supported


class SignalHealth(str, Enum):
    HEALTHY   = "healthy"    # signal present, fresh, from reliable source
    STALE     = "stale"      # signal present but older than TTL
    MISSING   = "missing"    # signal not present
    SUSPECT   = "suspect"    # signal present but from unofficial source


class BreakoutVerdict(str, Enum):
    BREAKOUT   = "breakout"   # strong cross-platform momentum, likely to chart
    PLATEAU    = "plateau"    # momentum confined to one platform, may not sustain
    ARTIFICIAL = "artificial" # bot/manipulation signals detected
    EMERGING   = "emerging"   # early signals present but insufficient to call
    UNKNOWN    = "unknown"    # insufficient data for any conclusion


@dataclass
class EvidenceItem:
    """A single piece of evidence from the data."""
    signal: str
    value: Optional[float]
    threshold: float          # the threshold this is being compared against
    passes: Optional[bool]    # True=above threshold, False=below, None=missing
    evidence_type: EvidenceType
    strength: EvidenceStrength
    source: str               # e.g. "spotify_official", "tiktok_unofficial"
    age_hours: float          # how old is this signal
    interpretation: str       # human-readable explanation of what this means


@dataclass
class AssumptionTest:
    """Result of testing one assumption against actual data."""
    assumption: str           # the stated assumption
    required_value: str       # what the assumption requires
    actual_value: str         # what the data shows
    result: str               # "supported" | "violated" | "untestable"
    evidence: list[EvidenceItem] = field(default_factory=list)
    notes: str = ""


@dataclass
class ContradictionFlag:
    """A detected contradiction between two signals."""
    signal_a: str
    value_a: float
    signal_b: str
    value_b: float
    contradiction_type: str   # e.g. "fake_viral", "algorithmic_push", "bought_followers"
    severity: str             # "high" | "medium" | "low"
    explanation: str
    hypothesis_implication: str  # which hypothesis this supports


@dataclass
class SubproblemResult:
    """Result of evaluating one subproblem."""
    question: str
    answer: str               # "yes" | "no" | "unclear" | "insufficient_data"
    confidence: float         # 0-1
    evidence_used: list[EvidenceItem]
    reasoning: str            # chain-of-thought explanation


@dataclass
class Hypothesis:
    """One competing explanation for the observed data."""
    label: str                # "a", "b", "c"
    name: str                 # e.g. "Artist will break out"
    description: str
    supporting_evidence: list[str]
    contradicting_evidence: list[str]
    prior_probability: float  # base rate (e.g. 8% of artists break out)
    likelihood: float         # P(evidence | hypothesis) — 0-1
    posterior: float          # P(hypothesis | evidence) — computed by engine


@dataclass
class ReasoningOutput:
    """Complete structured output from the A&R reasoning engine."""
    artist_id: int
    artist_name: str

    # Structured data layers
    facts: list[EvidenceItem]
    inferences: list[EvidenceItem]
    speculation: list[EvidenceItem]

    # Analysis chain
    subproblem_results: list[SubproblemResult]
    assumption_tests: list[AssumptionTest]
    contradictions: list[ContradictionFlag]

    # Hypothesis comparison
    hypotheses: list[Hypothesis]

    # Conclusion
    verdict: BreakoutVerdict
    confidence_pct: int        # 0-100
    primary_reasoning: str     # 2-3 sentence decision rationale
    decision_path: list[str]   # ordered steps that led to conclusion

    # Data quality
    missing_data: list[str]    # what signals are absent
    signal_health: dict[str, SignalHealth]
    data_completeness_pct: int # 0-100

    # Meta
    model_version: str
    reasoned_at: str           # ISO timestamp
