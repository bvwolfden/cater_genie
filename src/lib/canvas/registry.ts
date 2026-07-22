/**
 * Card canvas registry — serializable metadata only (no components), so it
 * can be imported by server pages, the /api/layout route, and client code.
 *
 * IMPORTANT: card ids are a stable public contract. They are persisted in
 * UserLayout rows in production — renaming an id silently drops that card
 * from every user's saved layout. Add new ids freely; never rename.
 *
 * New cards added here do NOT force themselves onto existing canvases: a
 * saved layout that predates a card leaves it in the library, discoverable.
 */

/** Card width in grid units on the xl 3-column canvas: 1 = rail, 2 = main, 3 = full row. */
export type Span = 1 | 2 | 3;

export type TabId = "overview" | "labor" | "bookings" | "delivery";

export type CardMeta = {
  id: string;
  title: string;
  description: string;
  defaultSpan: Span;
};

export type LayoutCard = { id: string; span?: Span };
export type TabLayout = { version: 1; cards: LayoutCard[] };

export const OVERVIEW_CARDS: CardMeta[] = [
  { id: "kpis", title: "KPIs", description: "Sales, labor, margin headline numbers for the selected period", defaultSpan: 3 },
  { id: "staffing-callout", title: "Staffing Callout", description: "Over/under-staffed days flagged in the imported schedule", defaultSpan: 3 },
  { id: "exec-strips", title: "Exec Summary", description: "Revenue, labor, and booked-ahead strips at a glance", defaultSpan: 3 },
  { id: "pulse", title: "Business Pulse", description: "Hero trend — the pulse of the business", defaultSpan: 3 },
  { id: "sales-labor-trend", title: "Daily Sales & Labor", description: "Net sales vs labor cost vs gross margin over the range", defaultSpan: 2 },
  { id: "insights", title: "AI Insights", description: "Narrative insight generated for the period", defaultSpan: 1 },
  { id: "comparisons", title: "Comparisons", description: "Month-over-month and year-over-year panels", defaultSpan: 2 },
  { id: "data-quality", title: "Data Quality", description: "Cross-source reconciliation flags", defaultSpan: 1 },
  { id: "weekly-comp", title: "Weekly Revenue vs Prior Year", description: "16 weeks of weekly revenue, dashed = projection", defaultSpan: 2 },
  { id: "balances", title: "Balances", description: "Account balances from QuickBooks", defaultSpan: 1 },
  { id: "channel-mix", title: "Revenue by Business Line", description: "Actual vs plan by channel", defaultSpan: 1 },
  { id: "labor-by-dept", title: "Labor by Department", description: "Paid cost, latest timesheet week", defaultSpan: 1 },
  { id: "sources", title: "Sources", description: "Ingestion status per data source", defaultSpan: 1 },
  { id: "daily-ledger", title: "Daily Ledger", description: "Day-by-day sales and labor table", defaultSpan: 2 },
];

export const LABOR_CARDS: CardMeta[] = [
  { id: "labor-kpis", title: "Payroll KPIs", description: "Payroll $, %, hours, and year-end projection for the range", defaultSpan: 3 },
  { id: "staffing-outlook", title: "Staffing Outlook", description: "Imported schedule vs typical staffing, day by day", defaultSpan: 3 },
  { id: "labor-trend", title: "Labor Cost Trend & Projection", description: "Weekly labor — actuals plus the seasonal projection", defaultSpan: 2 },
  { id: "employee-anomalies", title: "Employee Anomalies", description: "Hours patterns worth a look", defaultSpan: 1 },
  { id: "labor-comparisons", title: "Labor MoM & YoY", description: "Cost and % of revenue vs prior month and year", defaultSpan: 2 },
  { id: "dept-detail", title: "Latest Week by Department", description: "Department filter and per-department table", defaultSpan: 1 },
  { id: "employee-table", title: "Employee Table", description: "Per-employee hours and cost for the latest week", defaultSpan: 2 },
  { id: "time-off", title: "Upcoming Time Off", description: "Approved When I Work time-off requests on the horizon", defaultSpan: 1 },
];

export const BOOKINGS_CARDS: CardMeta[] = [
  { id: "booking-stats", title: "Booked Ahead Stats", description: "Revenue, orders, guests, and next-7-days headline numbers", defaultSpan: 3 },
  { id: "revenue-by-day", title: "Booked Revenue by Day", description: "Real forward orders — commitments, not projections", defaultSpan: 3 },
  { id: "upcoming-bookings", title: "Upcoming Bookings", description: "Every booked day with its orders, statuses, and revenue", defaultSpan: 2 },
  { id: "by-source", title: "By Source", description: "Where these bookings come from, with last-sync status", defaultSpan: 1 },
];
export const DELIVERY_CARDS: CardMeta[] = [
  { id: "slot-finder", title: "Slot Finder", description: "Answer the booking call: what windows can we offer, and pencil one in", defaultSpan: 3 },
  { id: "needs-attention", title: "Needs Attention", description: "Conflict flags for the day — tight runs, no-driver windows", defaultSpan: 3 },
  { id: "delivery-board", title: "Delivery Board", description: "Driver lanes and unassigned drops with assignment pickers", defaultSpan: 2 },
  { id: "delivery-map", title: "Map", description: "Pins by driver with run order from the depot", defaultSpan: 1 },
];

export const TAB_CARDS: Record<TabId, CardMeta[]> = {
  overview: OVERVIEW_CARDS,
  labor: LABOR_CARDS,
  bookings: BOOKINGS_CARDS,
  delivery: DELIVERY_CARDS,
};

/** Default layout per tab = every registered card, in registry order, at its default span. */
export const DEFAULT_LAYOUTS: Record<TabId, TabLayout> = {
  overview: { version: 1, cards: OVERVIEW_CARDS.map((c) => ({ id: c.id })) },
  labor: { version: 1, cards: LABOR_CARDS.map((c) => ({ id: c.id })) },
  bookings: { version: 1, cards: BOOKINGS_CARDS.map((c) => ({ id: c.id })) },
  delivery: { version: 1, cards: DELIVERY_CARDS.map((c) => ({ id: c.id })) },
};

export function isTabId(v: string): v is TabId {
  return v === "overview" || v === "labor" || v === "bookings" || v === "delivery";
}

export function cardMeta(tab: TabId, id: string): CardMeta | undefined {
  return TAB_CARDS[tab].find((c) => c.id === id);
}
