import "server-only";

/**
 * Seasonality context for AI agents (insights, forecasts, staffing).
 *
 * Distilled from July 2026 research on catering-industry seasonality
 * (The Knot wedding-month data, ezCater/NRN corporate-catering reports,
 * USDA ERS food-away-from-home series) cross-checked against this
 * business's own 2023–2025 weekly revenue in the comp sheet. Full report
 * with sources: docs/seasonality-research.md.
 */
export const SEASONALITY_CONTEXT = `Seasonality of this business (Pittsburgh restaurant + corporate drop-off + event catering; calibrated against its own 2023–2025 weekly history):

- The year is BIMODAL. Peak 1: September–October — back-to-office corporate surge plus wedding peak (September is Pittsburgh's #1 wedding month; 76% of US weddings fall May–October, and Pittsburgh's short outdoor season concentrates them further). Peak 2: the first three weeks of December — corporate holiday parties (Q4 carries ~a third of US catering orders; Dec 9 is the biggest large-order day nationally) plus retail holiday trays/bakery.
- The annual FLOOR is Dec 24 – Jan 7: corporate catering ≈ zero, retail quiet after Dec 23. January overall is the slowest month (own history: Jan is ~4% of annual revenue vs ~10% for peak months) and labor can exceed 100% of revenue in early-January weeks — that is structural (fixed labor base), not a data error.
- Summer (July–August) is a soft trough: offices empty, July 4 week runs roughly half of a normal week (own 2026 data: $44k labor week vs $58–67k neighbors). Late August is weakest.
- Holiday weeks to adjust explicitly: July 4, Memorial Day, Labor Day (lose the Monday, soft Friday), Thanksgiving (corporate dies ~Wed, but retail/tray pickup is the biggest single retail event of the year), Christmas week (corporate dead, retail holds through Dec 23–24).
- Weekday shape for corporate drop-off: demand concentrates Tue–Thu; Fridays are structurally weak all year (~10% of office traffic) and near-zero in summer.
- Pittsburgh weather: Jan–Feb snow days can cancel corporate orders same-day (stochastic downside, not a level shift); outdoor-wedding season is effectively May–mid-October.
- Do NOT project by extrapolating recent momentum across these boundaries — e.g. a soft July does not imply a soft September, and November strength does not carry into late December.`;
