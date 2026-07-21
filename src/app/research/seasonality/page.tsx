import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Nav } from "@/components/Nav";
import { Card, SectionHeader } from "@/components/primitives";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seasonality Research — CaterGenie",
  description:
    "US catering industry seasonality research calibrating CaterGenie's weekly labor/revenue projection model.",
};

/* ---------------------------------------------------------------- content */

// Composite tone: 0 = trough … 4 = peak (single-hue ordinal intensity).
const MONTHS: {
  month: string;
  corporate: string;
  weddings: string;
  events: string;
  retail: string;
  composite: string;
  tone: 0 | 1 | 2 | 3 | 4;
}[] = [
  {
    month: "Jan",
    corporate: "Rebound wk 2+ (kickoffs, planning meetings); wk 1 dead; snow-cancel risk",
    weddings: "Dead (~1–2%)",
    events: "Trough; some “January party” spillover",
    retail: "Slump (worst month)",
    composite: "Trough",
    tone: 0,
  },
  {
    month: "Feb",
    corporate: "Steady-normal; snow-cancel risk in PGH; Valentine's bump for bakery",
    weddings: "Dead",
    events: "Trough",
    retail: "Slow; small Valentine's lift",
    composite: "Low",
    tone: 1,
  },
  {
    month: "Mar",
    corporate: "Normal-to-good (no holidays, full work weeks)",
    weddings: "Very low",
    events: "Low",
    retail: "Recovering; Easter prep late Mar some years",
    composite: "Below avg",
    tone: 1,
  },
  {
    month: "Apr",
    corporate: "Good; Easter/admin-professionals-day bumps",
    weddings: "Ramp begins",
    events: "Low-moderate (spring meetings)",
    retail: "Easter bump",
    composite: "Average",
    tone: 2,
  },
  {
    month: "May",
    corporate: "Good; graduation-party catering add-on; Mother's Day (retail/brunch)",
    weddings: "Strong (~14%)",
    events: "Moderate",
    retail: "Good",
    composite: "Above avg",
    tone: 3,
  },
  {
    month: "Jun",
    corporate: "Softening late month; grad parties strong early June",
    weddings: "Peak tier (~14–16%)",
    events: "Moderate",
    retail: "Good",
    composite: "High",
    tone: 3,
  },
  {
    month: "Jul",
    corporate: "Summer trough — vacations, empty offices, July 4 week very weak",
    weddings: "Moderate dip (heat)",
    events: "Low (picnics only)",
    retail: "Steady retail, weak catering",
    composite: "Low-moderate",
    tone: 1,
  },
  {
    month: "Aug",
    corporate: "Trough continues; last 2 weeks worst (vacations)",
    weddings: "~10%",
    events: "Low",
    retail: "Steady",
    composite: "Low-moderate",
    tone: 1,
  },
  {
    month: "Sep",
    corporate: "Surge — back-to-office/school, budget season, meeting-heavy",
    weddings: "~13–16%; #1 month in Pittsburgh area",
    events: "Ramping (fall meetings, galas)",
    retail: "Good",
    composite: "High",
    tone: 3,
  },
  {
    month: "Oct",
    corporate: "Strong; full work weeks, no holidays",
    weddings: "~16–17%, national #1",
    events: "Strong (galas, conferences)",
    retail: "Good; Halloween",
    composite: "Peak tier",
    tone: 4,
  },
  {
    month: "Nov",
    corporate:
      "Strong thru wk before Thanksgiving; Thanksgiving-week corporate dies but retail/tray peak",
    weddings: "Small (early Nov only)",
    events: "Building",
    retail: "Thanksgiving = biggest single retail event",
    composite: "High",
    tone: 3,
  },
  {
    month: "Dec",
    corporate: "Wk 1–3 strong (team lunches, client gifts); wk 4 dead",
    weddings: "~1% (least popular month) [hard]",
    events: "Annual peak, weeks 1–3",
    retail: "Peak (Christmas trays/cookies)",
    composite: "Peak, then cliff Dec 24–31",
    tone: 4,
  },
];

const HARD_NUMBERS: {
  segment: string;
  note?: string;
  items: { text: React.ReactNode; sources: { label: string; href: string }[] }[];
}[] = [
  {
    segment: "Weddings",
    note: "best-sourced segment",
    items: [
      {
        text: (
          <>
            The Knot Real Weddings Study: <Hard>76% of US weddings occur May–October</Hard>. By
            month: <Hard>October 16–17% (#1), June 16%, May 14%, September 13%, August 10%,
            December ~1% (least popular)</Hard>. Fall (Sep–Nov) 35%, summer (Jun–Aug) 33%, winter
            (Jan–Mar) ~5%.
          </>
        ),
        sources: [
          {
            label: "theknot.com — off-season",
            href: "https://www.theknot.com/content/is-there-an-off-season-for-weddings",
          },
          {
            label: "theknot.com — fall season",
            href: "https://www.theknot.com/content/fall-most-popular-wedding-season",
          },
        ],
      },
      {
        text: (
          <>
            <strong>Pittsburgh/Western PA adjustment</strong>: local vendor guides report{" "}
            <strong>September as the #1 month in the Pittsburgh area</strong> (ahead of October,
            likely because late-Oct weather is already risky), with peak season May–Oct and{" "}
            <strong>December–March effectively off-season</strong>; the Northeast/Great-Lakes belt
            has “the most dramatic seasonal swing in the country,” compressing weddings into ~6
            months vs. Florida's inverted Dec–Apr season. Practical model implication: assume
            Pittsburgh wedding revenue is even <em>more</em> concentrated than the national curve —
            roughly 80%+ in May–Oct, near-zero Jan–Mar, with Sep/Oct together plausibly ~30–35% of
            annual wedding volume.
          </>
        ),
        sources: [
          {
            label: "ecoandivoryevents.com",
            href: "https://www.ecoandivoryevents.com/eco-friendly-weddings-and-events-blog/best-months-weddings-pittsburgh",
          },
          {
            label: "centric.events",
            href: "https://centric.events/blog/when-is-wedding-season-a-state-by-state-overview/",
          },
          { label: "tovstudiophoto.com", href: "https://tovstudiophoto.com/best-month-to-get-married/" },
        ],
      },
    ],
  },
  {
    segment: "Corporate / holiday catering",
    items: [
      {
        text: (
          <>
            <Hard>33% of all catering orders happen in Q4</Hard>; <Hard>December 9 is the #1 day
            for large-party orders in the US</Hard>; December peak pricing runs 10–20% above
            off-season. <em>(secondary aggregation; treat as directional-strong)</em>
          </>
        ),
        sources: [
          {
            label: "cateringfunnels.com",
            href: "https://cateringfunnels.com/blog/corporate-holiday-party-catering-playbook",
          },
        ],
      },
      {
        text: (
          <>
            Holiday orders “pick up the week before Thanksgiving and build through the{" "}
            <strong>first three weeks of December</strong>”; there are only ~3 usable event
            weekends in December before checkout.
          </>
        ),
        sources: [
          {
            label: "nrn.com",
            href: "https://www.nrn.com/menu-trends/why-catering-can-drive-growth-from-holiday-feasts-to-everyday-celebrations",
          },
          {
            label: "thestudiodowntown.net",
            href: "https://www.thestudiodowntown.net/post/christmas-in-july-why-smart-businesses-book-their-holiday-parties-now",
          },
        ],
      },
      {
        text: (
          <>
            Average catering order ≈ <Hard>$350, ~10× a $35 dine-in ticket</Hard> — holiday party
            weeks move revenue disproportionately to covers.
          </>
        ),
        sources: [
          {
            label: "chownow.com",
            href: "https://get.chownow.com/blog/restaurant-holiday-marketing-ideas/",
          },
        ],
      },
      {
        text: (
          <>
            Day-of-week: <Hard>only ~10% of weekday office traffic is on Fridays</Hard> (Envoy
            badge data); midweek (Tue–Thu) is when hybrid workers are in office, so drop-off demand
            concentrates Tue–Thu and Fridays are structurally weak year-round, worst in summer.
          </>
        ),
        sources: [
          {
            label: "envoy.com",
            href: "https://envoy.com/visitor-management/data-snack-series-summer-fridays",
          },
          {
            label: "fortune.com",
            href: "https://fortune.com/2024/07/18/summer-fridays-dead-remote-hybrid-flexible-work-productivity/",
          },
        ],
      },
      {
        text: (
          <>
            ezCater: 70% of business orders placed in morning hours; 90% of workplace orders are
            lunch; recurring meal programs +32% YoY (recurring programs <em>dampen</em> seasonality
            vs. one-off event catering).
          </>
        ),
        sources: [
          {
            label: "ezcater.com",
            href: "https://www.ezcater.com/lunchrush/restaurant/catering-business-profitability/",
          },
          {
            label: "qsrmagazine.com",
            href: "https://www.qsrmagazine.com/news/ezcater-data-shows-workplace-catering-emerging-as-key-growth-driver-for-restaurants/",
          },
        ],
      },
    ],
  },
  {
    segment: "Retail café / bakery",
    items: [
      {
        text: (
          <>
            USDA ERS: <Hard>food-away-from-home sales fall ~7–12% December→January</Hard> every
            year 2022–2025 (food-at-home falls 14–16%). This is the single best-sourced composite
            monthly number found.
          </>
        ),
        sources: [
          {
            label: "ers.usda.gov",
            href: "https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=110900",
          },
        ],
      },
      {
        text: (
          <>
            Independent bakery benchmarks: <Hard>holiday-surge periods (Thanksgiving–New Year's
            plus Easter/Valentine's/Mother's Day) = 25–45% of annual revenue</Hard>; in-store
            bakery categories see <strong>triple-digit lifts</strong> vs. everyday volume at
            holidays; ~97% of US households serve pie during the holidays.
          </>
        ),
        sources: [
          { label: "wallefy.ai", href: "https://wallefy.ai/bakery-marketing" },
          {
            label: "progressivegrocer.com",
            href: "https://progressivegrocer.com/bakery-has-retailers-rolling-holiday-dough",
          },
          { label: "sugar.org", href: "https://www.sugar.org/blog/happie-holidays/" },
        ],
      },
      {
        text: (
          <>
            December restaurant revenue can run <Hard>40–60% above an average month</Hard>, with
            January falling 30–40% from December (European POS data — treat as directional for US).
          </>
        ),
        sources: [
          {
            label: "happychef.cloud",
            href: "https://happychef.cloud/en/blog/finance/restaurant-cash-flow-management.html",
          },
        ],
      },
      {
        text: (
          <>
            January/February are the consensus slowest restaurant months; August is a secondary
            lull.
          </>
        ),
        sources: [
          { label: "getsauce.com", href: "https://www.getsauce.com/post/slowest-months-for-restaurants" },
        ],
      },
    ],
  },
];

const WEEKLY_EFFECTS: { title: string; detail: React.ReactNode }[] = [
  {
    title: "Thanksgiving week",
    detail:
      "Corporate drop-off ≈ 2 working days (Mon–Tue, Wed half); model corporate at ~30–40% of a normal week. Retail/bakery inverts to its annual peak (tray and pie pre-orders, Wed pickup crush). Labor should shift from delivery drivers to production/counter.",
  },
  {
    title: "Dec weeks 1–3",
    detail:
      "Holiday-party peak; Dec 9 ±2 days and the first three Fridays/Saturdays of December are the highest-demand slots of the year; expect stacked large orders and 40%+ above-baseline catering revenue.",
  },
  {
    title: "Dec 24–31",
    detail:
      "Corporate catering ≈ zero (offices closed); retail holds through Dec 23–24 (Christmas trays/cookies) then goes quiet; NYE is event-driven only. Model this week near the annual minimum for corporate, moderate-then-dead for retail.",
  },
  {
    title: "Jan 1–7",
    detail: (
      <>
        Dead across all segments; corporate resumes ~week 2 with kickoff/planning meetings (a real,
        modelable mini-bump — sales kickoffs cluster in January).{" "}
        <Src href="https://www.pipedrive.com/en/blog/sales-kickoff" label="pipedrive.com" />
      </>
    ),
  },
  {
    title: "July 4 week",
    detail:
      "Corporate at ~50% (bridge-day vacations); adjacent weeks also soft. Memorial Day and Labor Day weeks each lose Monday and run soft Fri.",
  },
  {
    title: "Summer Fridays / Fridays generally",
    detail:
      "Near-zero corporate drop-off on Fridays June–August; Fridays weak all year (~10% of office traffic). Weight corporate weekly revenue heavily to Tue–Wed–Thu.",
  },
  {
    title: "Labor Day → mid-October",
    detail:
      "The steepest ramp of the year — back-to-office corporate surge lands on top of the Sep (#1 in PGH)/Oct wedding peak. This is the stretch where under-staffing is most costly.",
  },
  {
    title: "Weather (Pittsburgh-specific)",
    detail:
      "Jan–Feb snow/ice days cancel or postpone corporate orders same-day (treat individual snow days as stochastic downside on Jan–Feb corporate, not a level shift). Outdoor-wedding exposure means late-Oct+ bookings shift indoors or vanish; the effective outdoor season is May–mid-October.",
  },
  {
    title: "One-off retail bumps",
    detail:
      "Valentine's Day, Easter week, Mother's Day (strong brunch/café day), graduation weekends (late May–mid June, party-tray demand).",
  },
];

// Monthly share of annual revenue by year (own comp sheet, 2023–2025).
const VALIDATION: { month: string; y2023: number; y2024: number; y2025: number }[] = [
  { month: "Jan", y2023: 5.0, y2024: 3.9, y2025: 3.6 },
  { month: "Feb", y2023: 6.7, y2024: 3.9, y2025: 3.7 },
  { month: "Mar", y2023: 5.7, y2024: 4.9, y2025: 6.0 },
  { month: "Apr", y2023: 8.8, y2024: 7.6, y2025: 5.5 },
  { month: "May", y2023: 10.1, y2024: 11.6, y2025: 9.1 },
  { month: "Jun", y2023: 10.4, y2024: 9.6, y2025: 11.8 },
  { month: "Jul", y2023: 7.3, y2024: 8.2, y2025: 7.1 },
  { month: "Aug", y2023: 12.0, y2024: 8.1, y2025: 11.1 },
  { month: "Sep", y2023: 9.4, y2024: 12.9, y2025: 11.9 },
  { month: "Oct", y2023: 9.3, y2024: 11.5, y2025: 9.1 },
  { month: "Nov", y2023: 11.1, y2024: 8.0, y2025: 13.4 },
  { month: "Dec", y2023: 4.3, y2024: 9.8, y2025: 7.8 },
];
const VALIDATION_MAX = Math.max(...VALIDATION.flatMap((r) => [r.y2023, r.y2024, r.y2025]));

/* ------------------------------------------------------------- components */

/** Marks a number that comes from a cited data source (vs. directional claims). */
function Hard({ children }: { children: React.ReactNode }) {
  return (
    <strong
      className="rounded bg-mint/10 box-decoration-clone px-1 py-px text-ink"
      title="Hard number — from a cited data source"
    >
      {children}
    </strong>
  );
}

function Src({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[11px] text-ink-3 underline decoration-line decoration-dotted underline-offset-2 transition hover:text-brand"
    >
      {label}
    </a>
  );
}

/** Ordinal intensity pill for the composite column — one hue, deeper = busier. */
function CompositePill({ label, tone }: { label: string; tone: 0 | 1 | 2 | 3 | 4 }) {
  const styles = [
    "bg-canvas-700 text-ink-3",
    "bg-canvas-700 text-ink-2",
    "bg-brand/10 text-ink-2",
    "bg-brand/20 text-ink",
    "bg-brand text-white",
  ][tone];
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", styles)}>
      {label}
    </span>
  );
}

/** Value + length-encoded inline bar (single hue = magnitude). */
function ShareCell({ value }: { value: number }) {
  return (
    <div className="min-w-[72px]">
      <span className="text-xs tabular-nums text-ink">{value.toFixed(1)}%</span>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-canvas-700">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${(value / VALIDATION_MAX) * 100}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function SeasonalityResearchPage() {
  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 md:px-8">
      <Nav />
      <Header />

      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          US Catering Industry Seasonality
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Researched July 2026 to calibrate CaterGenie's weekly labor/revenue projection model and
          to serve as prompt context for AI agents. Segments: corporate drop-off, weddings,
          corporate holiday parties, retail café/bakery — with Pittsburgh/Western PA climate
          adjustments and weekly-level effects.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
          <Hard>Highlighted numbers</Hard> come from a cited data source; everything else is
          directionally consistent across multiple trade sources but not measured. A distilled
          prompt-ready version lives in{" "}
          <code className="rounded bg-canvas-700 px-1 py-0.5 text-[11px] text-ink-2">
            src/lib/seasonality.ts
          </code>
        </p>
      </div>

      {/* (a) Month-by-month index */}
      <Card className="card-pad mb-4">
        <SectionHeader
          title="Month-by-Month Index by Segment"
          subtitle="Qualitative demand level per segment · composite intensity in the last column"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line">
                <th className="stat-label py-2 pr-3">Month</th>
                <th className="stat-label py-2 pr-3">Corporate lunch/drop-off</th>
                <th className="stat-label py-2 pr-3">Weddings</th>
                <th className="stat-label py-2 pr-3">Corp. events/holiday</th>
                <th className="stat-label py-2 pr-3">Retail café/bakery</th>
                <th className="stat-label py-2">Composite</th>
              </tr>
            </thead>
            <tbody>
              {MONTHS.map((m) => (
                <tr key={m.month} className="border-b border-line/60 align-top last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-ink">{m.month}</td>
                  <td className="py-2.5 pr-3 text-ink-2">{m.corporate}</td>
                  <td className="py-2.5 pr-3 text-ink-2">{m.weddings}</td>
                  <td className="py-2.5 pr-3 text-ink-2">{m.events}</td>
                  <td className="py-2.5 pr-3 text-ink-2">{m.retail}</td>
                  <td className="py-2.5">
                    <CompositePill label={m.composite} tone={m.tone} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* (b) Hard numbers */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {HARD_NUMBERS.map((seg) => (
          <Card key={seg.segment} className="card-pad">
            <SectionHeader title={seg.segment} subtitle={seg.note} />
            <ul className="space-y-3">
              {seg.items.map((item, i) => (
                <li key={i} className="text-xs leading-relaxed text-ink-2">
                  {item.text}
                  <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                    {item.sources.map((s) => (
                      <Src key={s.href} href={s.href} label={s.label} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card className="card-pad mb-4 border-amber/30 bg-amber/5">
        <p className="text-xs leading-relaxed text-ink-2">
          <strong className="text-ink">Composite caveat</strong> — no single public source
          publishes a US caterer revenue-by-month index (IBISWorld gates theirs). The Q4 = 33%
          figure plus the ERS Dec→Jan drop are the best anchors.
        </p>
      </Card>

      {/* (c) Weekly effects */}
      <Card className="card-pad mb-4">
        <SectionHeader
          title="Weekly-Level Effects to Encode in Models"
          subtitle="Specific weeks and days that deviate hard from their month's average"
        />
        <ol className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
          {WEEKLY_EFFECTS.map((e, i) => (
            <li key={e.title} className="flex gap-3">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-canvas-700 text-[10px] font-semibold tabular-nums text-ink-2">
                {i + 1}
              </span>
              <div className="text-xs leading-relaxed text-ink-2">
                <span className="font-semibold text-ink">{e.title}.</span> {e.detail}
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4 text-xs leading-relaxed text-ink-2">
          <strong className="text-ink">Modeling takeaway</strong> — the composite curve for this
          business mix is <strong className="text-ink">bimodal</strong>: a Sep–Oct peak (weddings +
          corporate surge) and a Dec 1–21 peak (parties + retail), separated by a soft Jul–Aug
          trough and a hard Jan trough, with the Dec 24–Jan 7 fortnight as the annual floor.
          Peak-to-trough on the catering side plausibly runs 2.5–4× (Q4 alone = one-third of
          orders); retail café is much flatter (~±10–15%) except for the holiday bakery spike, so
          labor flexing should concentrate on catering production/delivery staff rather than
          counter staff.
        </div>
      </Card>

      {/* Validation against own data */}
      <Card className="card-pad mb-6">
        <SectionHeader
          title="Validation Against Own Data"
          subtitle="Comp sheet, 2023–2025 · each month's share of that year's revenue"
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="overflow-x-auto lg:col-span-2">
            <table className="w-full min-w-[420px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="stat-label py-2 pr-3">Month</th>
                  <th className="stat-label py-2 pr-4">2023</th>
                  <th className="stat-label py-2 pr-4">2024</th>
                  <th className="stat-label py-2">2025</th>
                </tr>
              </thead>
              <tbody>
                {VALIDATION.map((r) => (
                  <tr key={r.month} className="border-b border-line/60 last:border-0">
                    <td className="py-2 pr-3 font-semibold text-ink">{r.month}</td>
                    <td className="py-2 pr-4"><ShareCell value={r.y2023} /></td>
                    <td className="py-2 pr-4"><ShareCell value={r.y2024} /></td>
                    <td className="py-2"><ShareCell value={r.y2025} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 text-xs leading-relaxed text-ink-2">
            <p>
              Weekly detail confirms the December cliff: in 2025 the week of Nov 30–Dec 6 did{" "}
              <Hard>$252.6k</Hard> (2.4× the $107k average week) and Dec 7–13 did $196.7k, then Dec
              21–27 collapsed to $60.6k and Dec 28–31 to $32.2k.
            </p>
            <p>
              The July 4th week and Thanksgiving week dips also show up every year. Jan–Feb are
              consistently the annual floor (3.6–6.7%).
            </p>
          </div>
        </div>
      </Card>

      <p className="mb-4 text-[11px] text-ink-3">
        Source document: docs/seasonality-research.md · researched July 2026.
      </p>
    </main>
  );
}
