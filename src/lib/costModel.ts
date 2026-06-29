// Cost model for the profit projections.
//
// Labor and food are derived from real data. The items below are NOT in the
// data yet — they're explicit, tunable STUBS so the profit/partner numbers
// reflect a fuller P&L. They're surfaced in the UI and clearly flagged until
// we connect the real figures (QuickBooks expense categories, loan schedule).

export interface CostComponent {
  key: string;
  label: string;
  basis: string;
  stub: boolean;
}

export const COST_MODEL = {
  overheadPct: 0.06, // rent, utilities, insurance
  gasPct: 0.02, // fuel / delivery
  otherOpexPct: 0.03, // misc operating
  debtWeekly: 2000, // loan principal repayment
  interestWeekly: 500, // interest
};

/** % of revenue applied per week (overhead + gas + other). */
export const OPEX_PCT = COST_MODEL.overheadPct + COST_MODEL.gasPct + COST_MODEL.otherOpexPct;
/** Fixed $/week (debt + interest). */
export const FIXED_WEEKLY = COST_MODEL.debtWeekly + COST_MODEL.interestWeekly;

export const STUBBED_COSTS: CostComponent[] = [
  { key: "overhead", label: "Overhead (rent, utilities, insurance)", basis: "6% of revenue", stub: true },
  { key: "gas", label: "Gas / fuel", basis: "2% of revenue", stub: true },
  { key: "otherOpex", label: "Other operating", basis: "3% of revenue", stub: true },
  { key: "debt", label: "Debt payback", basis: "$2,000 / week", stub: true },
  { key: "interest", label: "Interest", basis: "$500 / week", stub: true },
];
