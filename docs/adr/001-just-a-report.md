# ADR-001 — Apply New is a report, not a selection instrument

- **Status:** Proposed (drafted 2026-06-11; needs maintainer co-sign)
- **Date:** 2026-06-11
- **Deciders:** Rinaldo Festa (proposer) · Matteo Roversi (pending)

## Decision

Apply New produces a **report** — a photograph of how a candidate works with AI and
agentic tooling. It evaluates nothing and nobody.

1. **No grade, no rank, no recommendation, no pass/fail, no hire signal** — anywhere
   in the pipeline, the payload, or the intake.

2. **A human makes every decision.** A person at Play New reads the report and decides
   whether to invite the candidate to a call. The tool never advances, rejects, or
   orders candidates. Full stop.

3. **The bright line: AI may score the artifact, never the person.** The two embedded
   scores — authenticity (a log-integrity screen) and groundedness (does the prose
   track the structured data) — measure the *report's* integrity. They block a
   malformed or unsupported report, which the candidate can regenerate; they are not
   candidate-quality signals and must never be displayed, stored, or used as such.

4. **Intake corollary: reports reach humans unranked.** No server-side sorting,
   filtering, or thresholding on any profile-derived field, ever. One `ORDER BY` on a
   profile field would silently re-create the automated screening tool this decision
   renounces — without a single line of CLI code changing.

5. **Local by design.** Nothing leaves the candidate's machine until they run
   `submit --yes`, with one path that needs care: with `ANTHROPIC_API_KEY` set, the
   narrative input (project labels, README/CLAUDE.md excerpts, dependency names,
   commit subjects, sampled prompts) goes to api.anthropic.com under the candidate's
   own key. That path now warns at runtime, never overrides an explicit
   `--narrative-file`, and is disclosed in PRIVACY.md. The subscription path
   (`/apply-new`) and the manual path stay fully local until submit.

## Context

The profile is read inside a hiring funnel, which makes the frame question
load-bearing rather than cosmetic. Candidate feedback shows readers over-interpret
numbers as calibrated traits when given the chance ("89% co-thinking" read as an
identity badge); the README's no-grades stance was praised by a tooling author as
"exactly the right constraint". Meanwhile the legal environment (below) punishes
evaluation and rewards description-plus-human-judgment. The alternative frame —
positioning `candidate.json` as a validated selection instrument — would require a
named construct, norming, criterion validity, and a heavier legal posture, and it
invites exactly the over-reading the feedback documents.

## Legal posture (recorded honestly)

This frame is **not** an exemption claim:

- **GDPR Art. 22** does not apply, because no decision about the candidate is based
  solely on automated processing — *provided* the human review stays meaningful
  (a person reading the report, not rubber-stamping a number; points 3 and 4 are
  what keep this true).
- **NYC Local Law 144**: with no simplified score, classification, or ranking used to
  substantially assist the decision, Apply New is arguably not an AEDT. This holds
  only while points 1 and 4 hold.
- **EU AI Act (Reg. 2024/1689)**: a behavioral profile read in recruitment is
  Annex III §4(a) territory, and Art. 6(3) denies the high-risk derogation to systems
  that perform profiling of natural persons. Apply New therefore continues to be
  treated as **high-risk** (PRIVACY.md §7) and aims at being trivially compliant —
  human oversight, transparency, logging, data minimisation are already the design —
  rather than claiming to be out of scope. Deployer obligations apply from
  2 August 2026.

## Consequences

- Measurement work is re-aimed at **fidelity** (drift, test-retest: is the photograph
  faithful) and **influence monitoring** (does the report bias who gets invited to a
  call), not predictive validity. Prediction is no longer claimed; the cost named by
  Kuncel et al. 2013 (mechanical combination outperforms human reading) is accepted
  knowingly.
- Any future feature that emits a number about a person (learned probes, work-sample
  observations) must surface it as **anchored counts and observations** ("spec-first
  planning: seen in 3 of 40 sessions"), never as scores. The optional work-sample is
  an alternative capture venue, observed — never model-graded.
- README ("What it isn't") and PRIVACY.md carry the candidate-facing version of this
  decision; the intake commitment (point 4) binds the server side, where this frame
  is most easily eroded.
