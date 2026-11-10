/**
 * The thresholds every KPI indicator in the product compares against.
 *
 * They live in `lib/` because three features need them and ESLint's `boundaries`
 * rule forbids a feature from importing a sibling — cross-feature reuse has to be
 * named and owned somewhere shared, which is exactly what this file is. Reports
 * owned them before; Developer Analytics could not import that module, so it
 * re-typed the numbers as literals and one of them was WRONG.
 *
 * The defect that caused this file to exist:
 *
 *   Developer Analytics  `metrics.approvalRate >= 50`
 *   Admin Reports        `approvalRate >= APPROVAL_RATE_TARGET` (70)
 *
 * The same FL 2.4.3 indicator, over the same data, reading "On target" for a
 * developer and "Below target" for the administrator looking at that developer.
 * A duplicated threshold is not a duplicated constant; it is two different
 * business rules that happen to look alike until one of them drifts.
 *
 * Anything comparing a KPI against a number belongs here. Nothing else does —
 * this file must stay free of arithmetic so that a threshold change is provably
 * a threshold change.
 */

/**
 * ⚠️ OPEN BUSINESS QUESTION — the value below is not signed off.
 *
 * FL 2.4.3 Logic 2 requires an approval-rate target so the card can read "Below
 * target" or "On target", and the specification never gives a number. 70 is a
 * placeholder chosen so the indicator is exercised, and the screens that use it
 * say so on the card (`common.kpi.targetNote`) rather than presenting it as
 * agreed.
 *
 * It must be signed off before Phase 2, and it lives here as ONE named constant
 * precisely so that sign-off is a one-line change. See
 * `docs/architecture.md` § "Open items needing business input".
 */
export const APPROVAL_RATE_TARGET = 70;

/**
 * Above this, the average cycle count is flagged as high.
 *
 * Same caveat as the target above: FL 2.4.3 asks for the indicator without
 * naming the number.
 */
export const HIGH_CYCLE_THRESHOLD = 2;

/**
 * At or below this, average quality rank reads as good.
 *
 * Note the comparison is INVERTED against every other threshold here, because 1
 * is the best rank and 3 the worst (FS 2.9.2.5). A call site that writes
 * `>= GOOD_RANK_THRESHOLD` has the sense backwards.
 */
export const GOOD_RANK_THRESHOLD = 1.5;

/**
 * Approval rates that band a reviewer as lenient or strict.
 *
 * These describe a reviewer's habits rather than grading their performance —
 * a reviewer working on a fragile subsystem SHOULD send more back — so they are
 * separate constants from `APPROVAL_RATE_TARGET` even though one currently
 * shares its value. Collapsing them would mean signing off the approval-rate
 * target silently re-labelled every reviewer.
 */
export const LENIENT_APPROVAL_RATE = 70;
export const STRICT_APPROVAL_RATE = 30;

/**
 * Developer Performance standing thresholds in Reports (Developer Quality KPI Card).
 *
 * Sample evaluation rules:
 * - 0 eligible reviewed tasks -> 'none' (No reviews)
 * - 1–2 eligible reviewed tasks -> 'limited' (Limited Data)
 * - 3+ eligible reviewed tasks -> calculate weighted Quality Score (0–100):
 *     FTA (35%) + Avg Rank (30%) + Avg Cycles (20%) + Normalized Rework (15%)
 *
 * Thresholds:
 * - Quality Score >= 60 -> 'good' (Good), subject to safety guardrails
 * - Quality Score >= 40 and < 60 -> 'fair' (Fair)
 * - Quality Score < 40 -> 'poor' (Needs attention)
 */
export const DEV_STANDING_MIN_ELIGIBLE_TASKS = 3;

export const DEV_QUALITY_WEIGHT_FTA = 0.35;
export const DEV_QUALITY_WEIGHT_RANK = 0.30;
export const DEV_QUALITY_WEIGHT_CYCLES = 0.20;
export const DEV_QUALITY_WEIGHT_REWORK = 0.15;

export const DEV_STANDING_SCORE_GOOD = 60;
export const DEV_STANDING_SCORE_FAIR = 40;

/** Safety guardrails preventing Good standing */
export const DEV_GUARDRAIL_MAX_RANK_FOR_GOOD = 2.50;
export const DEV_GUARDRAIL_MAX_CYCLES_FOR_GOOD = 3.00;
export const DEV_GUARDRAIL_MAX_REWORK_FOR_GOOD = 2.00;

/** Backward-compatibility aliases and legacy threshold constants */
export const DEV_STANDING_GOOD_FIRST_TIME_APPROVAL_RATE = 70;
export const DEV_STANDING_GOOD_AVG_RANK = 2.0;
export const DEV_STANDING_GOOD_AVG_CYCLES = 2.0;
export const DEV_STANDING_GOOD_AVG_REWORK = 1.0;

export const DEV_STANDING_FAIR_FIRST_TIME_APPROVAL_RATE = 35;
export const DEV_STANDING_FAIR_AVG_RANK = 2.5;
export const DEV_STANDING_FAIR_AVG_CYCLES = 3.0;
export const DEV_STANDING_FAIR_AVG_REWORK = 2.0;

export const DEV_STANDING_GOOD_APPROVAL_RATE = DEV_STANDING_GOOD_FIRST_TIME_APPROVAL_RATE;
export const DEV_STANDING_FAIR_APPROVAL_RATE = DEV_STANDING_FAIR_FIRST_TIME_APPROVAL_RATE;

