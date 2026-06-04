"""
Bayesian hypothesis comparison for A&R decisions.

Three competing hypotheses:
  A: Artist will break out (strong cross-platform momentum)
  B: Artist will plateau (momentum on one platform only)
  C: Artist is artificial (bot-driven metrics)

Uses approximate Bayesian updating: P(H|E) ∝ P(E|H) × P(H)
"""
from __future__ import annotations
import math
from .types import (
    Hypothesis, SubproblemResult, ContradictionFlag, BreakoutVerdict, EvidenceItem
)


# Base rates (prior probabilities)
PRIOR_BREAKOUT   = 0.08   # 8% of artists with any signals actually break out
PRIOR_PLATEAU    = 0.62   # most artists plateau
PRIOR_ARTIFICIAL = 0.30   # ~30% of viral signals have inorganic component


def _get_subproblem(subproblems: list[SubproblemResult], keyword: str) -> SubproblemResult | None:
    """Find a subproblem result by keyword in its question."""
    for sp in subproblems:
        if keyword.lower() in sp.question.lower():
            return sp
    return None


def build_hypotheses(
    subproblems: list[SubproblemResult],
    contradictions: list[ContradictionFlag],
    signals: dict,
) -> list[Hypothesis]:
    """
    Build and score three hypotheses given subproblem results.
    Returns list sorted by posterior probability descending.
    """
    sp_momentum    = _get_subproblem(subproblems, "early momentum")
    sp_organic     = _get_subproblem(subproblems, "organic or artificial")
    sp_platform    = _get_subproblem(subproblems, "right platform")
    sp_persistence = _get_subproblem(subproblems, "persist")
    sp_infra       = _get_subproblem(subproblems, "infrastructure")

    def _conf(sp: SubproblemResult | None, default: float = 0.3) -> float:
        return sp.confidence if sp is not None else default

    def _answer(sp: SubproblemResult | None) -> str:
        return sp.answer if sp is not None else "insufficient_data"

    # --- Hypothesis A: Breakout ---
    # P(E|breakout) = product of subproblem confidences when answers support breakout
    # Compute per-subproblem scores (0-1) based on whether answers support breakout.
    # Use weighted average instead of raw product to avoid score collapse.
    WEIGHTS_A = {"momentum": 0.30, "organic": 0.25, "platform": 0.20, "persistence": 0.10, "infra": 0.15}

    def _score_a(sp, positive_answers, unclear_scale=0.6, negative_scale=0.1):
        if sp is None:
            return 0.3  # neutral default when subproblem missing
        a = sp.answer
        if a in positive_answers:
            return sp.confidence
        elif a == "unclear":
            return sp.confidence * unclear_scale
        elif a == "insufficient_data":
            return 0.3
        else:
            return sp.confidence * negative_scale

    momentum_score    = _score_a(sp_momentum,    ("yes",))
    organic_score     = _score_a(sp_organic,     ("organic",), unclear_scale=0.4, negative_scale=0.05)
    platform_score    = _score_a(sp_platform,    ("yes",),     unclear_scale=0.7)  # "partial" maps to unclear-like
    if sp_platform and sp_platform.answer == "partial":
        platform_score = sp_platform.confidence * 0.65
    persistence_score = _score_a(sp_persistence, ("yes", "persistent momentum"), unclear_scale=0.6)
    infra_score       = _score_a(sp_infra,       ("yes", "partial"),             unclear_scale=0.5)

    likelihood_a = (
        WEIGHTS_A["momentum"]    * momentum_score +
        WEIGHTS_A["organic"]     * organic_score +
        WEIGHTS_A["platform"]    * platform_score +
        WEIGHTS_A["persistence"] * persistence_score +
        WEIGHTS_A["infra"]       * infra_score
    )
    # Cap at 0.95 to avoid overconfidence
    likelihood_a = min(likelihood_a, 0.95)

    supporting_a = []
    contradicting_a = []

    for sp in subproblems:
        if sp.answer in ("yes", "organic", "persistent momentum"):
            supporting_a.append(f"{sp.question[:60]}: {sp.answer}")
        elif sp.answer in ("no", "artificial"):
            contradicting_a.append(f"{sp.question[:60]}: {sp.answer}")

    for c in contradictions:
        if c.severity == "high":
            contradicting_a.append(f"{c.contradiction_type}: {c.signal_a} vs {c.signal_b}")

    # --- Hypothesis B: Plateau ---
    # Higher score components when: single-platform, spike-only, no infra, suspect organic
    WEIGHTS_B = {"platform": 0.25, "persistence": 0.25, "infra": 0.20, "organic": 0.20, "momentum": 0.10}

    platform_plateau = (
        1.0 if _answer(sp_platform) == "partial" else
        0.5 if _answer(sp_platform) == "yes" else 0.7
    )
    persistence_plateau = (
        1.0 if _answer(sp_persistence) in ("no", "spike fading") else
        0.65 if _answer(sp_persistence) == "unclear" else 0.3
    )
    infra_plateau = (
        1.0 if _answer(sp_infra) == "no" else
        0.65 if _answer(sp_infra) == "partial" else 0.25
    )
    organic_plateau = (
        0.8 if _answer(sp_organic) == "suspect" else
        0.45 if _answer(sp_organic) == "organic" else 0.9
    )
    momentum_plateau = 0.7 if _answer(sp_momentum) in ("yes", "unclear") else 0.4

    likelihood_b = (
        WEIGHTS_B["platform"]    * platform_plateau +
        WEIGHTS_B["persistence"] * persistence_plateau +
        WEIGHTS_B["infra"]       * infra_plateau +
        WEIGHTS_B["organic"]     * organic_plateau +
        WEIGHTS_B["momentum"]    * momentum_plateau
    )
    likelihood_b = min(likelihood_b, 0.95)

    supporting_b = []
    contradicting_b = []

    if _answer(sp_platform) == "partial":
        supporting_b.append("Platform momentum confined to single platform")
    if _answer(sp_persistence) in ("no", "unclear"):
        supporting_b.append("Persistence weak or unconfirmed")
    if _answer(sp_infra) in ("no", "partial"):
        supporting_b.append("Limited infrastructure to sustain growth")
    for c in contradictions:
        if c.contradiction_type in ("fake_viral", "meme_without_fanbase"):
            supporting_b.append(f"{c.contradiction_type} contradiction detected")
    for sp in subproblems:
        if sp.answer in ("organic",):
            contradicting_b.append(f"Organic signal: {sp.question[:50]}")

    # --- Hypothesis C: Artificial ---
    # Likelihood driven by contradiction severity
    likelihood_c = 0.05  # base: no contradictions
    for c in contradictions:
        if c.severity == "high":
            likelihood_c *= 3.0
        elif c.severity == "medium":
            likelihood_c *= 1.8
    likelihood_c = min(likelihood_c, 0.95)

    supporting_c = [
        f"{c.contradiction_type} ({c.severity}): {c.signal_a}={c.value_a:.3f} vs {c.signal_b}={c.value_b:.3f}"
        for c in contradictions
    ]
    contradicting_c = []
    if _answer(sp_organic) == "organic":
        contradicting_c.append("Organic subproblem found no contradictions")
    for sp in subproblems:
        if sp.answer == "yes" and sp.confidence > 0.6:
            contradicting_c.append(f"Strong genuine signal: {sp.question[:50]}")

    # --- Bayesian normalization ---
    unnorm_a = likelihood_a * PRIOR_BREAKOUT
    unnorm_b = likelihood_b * PRIOR_PLATEAU
    unnorm_c = likelihood_c * PRIOR_ARTIFICIAL
    total = unnorm_a + unnorm_b + unnorm_c

    if total == 0:
        posterior_a = PRIOR_BREAKOUT
        posterior_b = PRIOR_PLATEAU
        posterior_c = PRIOR_ARTIFICIAL
    else:
        posterior_a = unnorm_a / total
        posterior_b = unnorm_b / total
        posterior_c = unnorm_c / total

    hyp_a = Hypothesis(
        label="a",
        name="Artist will break out",
        description="Strong cross-platform momentum that is organic, persistent, and backed by infrastructure — likely to chart.",
        supporting_evidence=supporting_a,
        contradicting_evidence=contradicting_a,
        prior_probability=PRIOR_BREAKOUT,
        likelihood=likelihood_a,
        posterior=round(posterior_a, 4),
    )
    hyp_b = Hypothesis(
        label="b",
        name="Artist will plateau",
        description="Momentum confined to one platform or algorithmic/meme-driven — unlikely to sustain cross-platform.",
        supporting_evidence=supporting_b,
        contradicting_evidence=contradicting_b,
        prior_probability=PRIOR_PLATEAU,
        likelihood=likelihood_b,
        posterior=round(posterior_b, 4),
    )
    hyp_c = Hypothesis(
        label="c",
        name="Artist is artificial",
        description="Metrics are bot-driven, purchased, or manipulated — signals do not represent genuine audience interest.",
        supporting_evidence=supporting_c,
        contradicting_evidence=contradicting_c,
        prior_probability=PRIOR_ARTIFICIAL,
        likelihood=likelihood_c,
        posterior=round(posterior_c, 4),
    )

    hypotheses = [hyp_a, hyp_b, hyp_c]
    hypotheses.sort(key=lambda h: h.posterior, reverse=True)
    return hypotheses


def select_verdict(
    hypotheses: list[Hypothesis],
    subproblems: list[SubproblemResult],
    data_completeness: float,
) -> tuple[BreakoutVerdict, int, str]:
    """
    Select final verdict, confidence, and primary reasoning.

    Returns: (verdict, confidence_pct, reasoning_text)
    """
    # Find hypotheses by label
    hyp_by_label = {h.label: h for h in hypotheses}
    hyp_a = hyp_by_label.get("a")
    hyp_b = hyp_by_label.get("b")
    hyp_c = hyp_by_label.get("c")

    all_insufficient = all(sp.answer == "insufficient_data" for sp in subproblems)

    # Rule 1: insufficient data
    if data_completeness < 0.4 or all_insufficient:
        return (
            BreakoutVerdict.UNKNOWN,
            int(data_completeness * 40),  # max 16% confidence
            (
                f"Insufficient signal data (completeness={data_completeness:.0%}) to draw "
                "any reliable conclusion. More data collection required before assessment."
            ),
        )

    top = hypotheses[0]

    # Rule 2: Hypothesis C dominant — artificial
    # Also trigger when ≥2 high-severity contradictions detected AND hyp_c has highest likelihood
    high_sev_contradictions = sum(
        1 for h in hypotheses
        for ev in h.supporting_evidence
        if "(high)" in ev
    )
    c_likelihood_leads = (
        hyp_c is not None and hyp_b is not None
        and hyp_c.likelihood > hyp_b.likelihood * 0.60
        and hyp_c.likelihood > 0.35
    )
    if hyp_c and (hyp_c.posterior > 0.40 or c_likelihood_leads):
        confidence_pct = int(hyp_c.posterior * 85)
        reasoning = (
            f"Artificial activity signals dominate (posterior={hyp_c.posterior:.2f}). "
            f"Detected contradictions: {', '.join(hyp_c.supporting_evidence[:2]) if hyp_c.supporting_evidence else 'multiple patterns'}. "
            "Metrics cannot be trusted as indicators of genuine audience interest."
        )
        return BreakoutVerdict.ARTIFICIAL, confidence_pct, reasoning

    # Rule 3: Hypothesis A — breakout verdict
    # Trigger if: posterior highest AND > 0.35, OR likelihood_a is highest AND > 0.55
    # (Strong evidence overrides the conservative 8% base rate when likelihood clearly leads.)
    a_likelihood_leads = (
        hyp_a is not None and hyp_b is not None and hyp_c is not None
        and hyp_a.likelihood > hyp_b.likelihood
        and hyp_a.likelihood > hyp_c.likelihood
        and hyp_a.likelihood > 0.55
    )
    a_posterior_leads = hyp_a is not None and hyp_a.posterior == top.posterior and hyp_a.posterior > 0.35
    if a_posterior_leads or a_likelihood_leads:
        # Confidence reflects posterior (Bayesian) but is floored at evidence-based minimum
        posterior_conf = int((hyp_a.posterior if hyp_a else 0) * 100)
        likelihood_conf = int((hyp_a.likelihood if hyp_a else 0) * 70)
        confidence_pct = max(posterior_conf, likelihood_conf, 60) if a_likelihood_leads else posterior_conf
        confidence_pct = min(confidence_pct, 90)
        supporting = hyp_a.supporting_evidence[:2] if hyp_a else []
        reasoning = (
            f"Breakout hypothesis supported by evidence "
            f"(likelihood={hyp_a.likelihood:.2f}, posterior={hyp_a.posterior:.2f}). "
            f"Key supporting signals: {'; '.join(supporting) if supporting else 'cross-platform momentum confirmed'}. "
            "Signal quality and cross-platform alignment support a genuine breakout trajectory."
        )
        return BreakoutVerdict.BREAKOUT, confidence_pct, reasoning

    # Rule 4: Hypothesis B highest
    if hyp_b and hyp_b.posterior == top.posterior:
        confidence_pct = int(hyp_b.posterior * 85)
        reasoning = (
            f"Plateau hypothesis is strongest (posterior={hyp_b.posterior:.2f}). "
            "Momentum is present but confined or unsustained. "
            f"Key factors: {'; '.join(hyp_b.supporting_evidence[:2]) if hyp_b.supporting_evidence else 'single-platform or spike pattern'}."
        )
        return BreakoutVerdict.PLATEAU, confidence_pct, reasoning

    # Rule 5: No clear winner but data present — emerging
    if data_completeness > 0.5:
        confidence_pct = int(top.posterior * 60)
        reasoning = (
            f"No hypothesis exceeds 35% posterior (top={top.name}: {top.posterior:.2f}). "
            "Early signals are present but insufficient to distinguish breakout from plateau. "
            "Artist is in emerging phase — monitor for next 2-4 weeks."
        )
        return BreakoutVerdict.EMERGING, confidence_pct, reasoning

    return (
        BreakoutVerdict.UNKNOWN,
        15,
        "Data completeness and hypothesis confidence both insufficient for a reliable verdict.",
    )


def build_decision_path(
    subproblems: list[SubproblemResult],
    assumption_tests: list,
    contradictions: list[ContradictionFlag],
    verdict: BreakoutVerdict,
) -> list[str]:
    """
    Build ordered list of reasoning steps that led to the verdict.
    Each step is a complete sentence in audit-trail format.
    """
    steps = []
    step_n = 1

    # Step 1: data assessment
    n_subproblems = len(subproblems)
    steps.append(
        f"Step {step_n}: Evaluated {n_subproblems} subproblems across momentum, "
        "organicity, platform, persistence, and infrastructure dimensions."
    )
    step_n += 1

    # Steps for each subproblem
    for sp in subproblems:
        # Extract key evidence
        passing = [e for e in sp.evidence_used if e.passes is True]
        failing = [e for e in sp.evidence_used if e.passes is False]
        key_ev = passing[:1] or failing[:1]
        ev_str = ""
        if key_ev:
            ev = key_ev[0]
            ev_str = (
                f" Key signal: {ev.signal}={ev.value:.3f} "
                f"({'≥' if ev.passes else '<'} threshold {ev.threshold})"
                if ev.value is not None else f" Key signal: {ev.signal} missing"
            )
        steps.append(
            f"Step {step_n}: {sp.question} → answer='{sp.answer}', "
            f"confidence={sp.confidence:.2f}.{ev_str}"
        )
        step_n += 1

    # Step for assumption tests
    supported = [a for a in assumption_tests if a.result == "supported"]
    violated  = [a for a in assumption_tests if a.result == "violated"]
    steps.append(
        f"Step {step_n}: Tested {len(assumption_tests)} core A&R assumptions — "
        f"{len(supported)} supported, {len(violated)} violated, "
        f"{len(assumption_tests) - len(supported) - len(violated)} untestable."
    )
    step_n += 1

    # Step for contradictions
    high_c = [c for c in contradictions if c.severity == "high"]
    med_c  = [c for c in contradictions if c.severity == "medium"]
    if contradictions:
        contradiction_names = [c.contradiction_type for c in contradictions[:3]]
        steps.append(
            f"Step {step_n}: Contradiction detector found {len(contradictions)} patterns "
            f"({len(high_c)} high-severity, {len(med_c)} medium-severity): "
            f"{', '.join(contradiction_names)}. "
            f"High-severity contradictions reduce breakout posterior and elevate artificial/plateau probability."
        )
    else:
        steps.append(
            f"Step {step_n}: No contradiction patterns detected — signal set is internally consistent. "
            "This supports organic hypothesis."
        )
    step_n += 1

    # Step for hypothesis scoring
    steps.append(
        f"Step {step_n}: Applied Bayesian hypothesis scoring with priors "
        f"(breakout=8%, plateau=62%, artificial=30%). Likelihoods computed from subproblem "
        "confidences and contradiction multipliers. Posteriors normalized to sum to 1.0."
    )
    step_n += 1

    # Contradiction impact details
    if high_c:
        for c in high_c[:2]:
            steps.append(
                f"Step {step_n}: {c.contradiction_type} contradiction ({c.signal_a}={c.value_a:.3f} vs "
                f"{c.signal_b}={c.value_b:.3f}) multiplied artificial likelihood by 3.0 → "
                f"{c.hypothesis_implication}."
            )
            step_n += 1

    # Final verdict step
    steps.append(
        f"Step {step_n}: Final verdict selected: '{verdict.value}'. "
        "Decision follows from winning hypothesis posterior and data completeness gate."
    )

    return steps
