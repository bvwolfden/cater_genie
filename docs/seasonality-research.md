# US Catering Industry Seasonality — Research Report

Researched July 2026 to calibrate CaterGenie's weekly labor/revenue projection model and to serve as prompt context for AI agents. Segments: corporate drop-off, weddings, corporate holiday parties, retail café/bakery — with Pittsburgh/Western PA climate adjustments and weekly-level effects. Confidence flags: numbers marked **[hard]** come from a cited data source; unmarked claims are directionally consistent across multiple trade sources but not measured.

A distilled prompt-ready version lives in `src/lib/seasonality.ts` (`SEASONALITY_CONTEXT`).

---

## (a) Month-by-month qualitative index by segment

| Month | Corporate lunch/drop-off | Weddings | Corp. events/holiday | Retail café/bakery | Composite |
|---|---|---|---|---|---|
| Jan | Rebound wk 2+ (kickoffs, planning meetings); wk 1 dead; snow-cancel risk | Dead (~1–2%) | Trough; some "January party" spillover | Slump (worst month) | **Trough** |
| Feb | Steady-normal; snow-cancel risk in PGH; Valentine's bump for bakery | Dead | Trough | Slow; small Valentine's lift | Low |
| Mar | Normal-to-good (no holidays, full work weeks) | Very low | Low | Recovering; Easter prep late Mar some years | Below avg |
| Apr | Good; Easter/admin-professionals-day bumps | Ramp begins | Low-moderate (spring meetings) | Easter bump | Average |
| May | Good; graduation-party catering add-on; Mother's Day (retail/brunch) | **Strong (~14%)** | Moderate | Good | Above avg |
| Jun | Softening late month; grad parties strong early June | **Peak tier (~14–16%)** | Moderate | Good | High |
| Jul | **Summer trough** — vacations, empty offices, July 4 week very weak | Moderate dip (heat) | Low (picnics only) | Steady retail, weak catering | Low-moderate |
| Aug | Trough continues; last 2 weeks worst (vacations) | ~10% | Low | Steady | Low-moderate |
| Sep | **Surge** — back-to-office/school, budget season, meeting-heavy | **~13–16%; #1 month in Pittsburgh area** | Ramping (fall meetings, galas) | Good | **High** |
| Oct | Strong; full work weeks, no holidays | **~16–17%, national #1** | Strong (galas, conferences) | Good; Halloween | **Peak tier** |
| Nov | Strong thru wk before Thanksgiving; Thanksgiving-week corporate dies but **retail/tray peak** | Small (early Nov only) | Building | **Thanksgiving = biggest single retail event** | High |
| Dec | Wk 1–3 strong (team lunches, client gifts); wk 4 dead | ~1% (least popular month) **[hard]** | **Annual peak, weeks 1–3** | **Peak** (Christmas trays/cookies) | **Peak, then cliff Dec 24–31** |

---

## (b) Hard numbers found

**Weddings (best-sourced segment)**
- The Knot Real Weddings Study: **76% of US weddings occur May–October**. By month: **October 16–17% (#1), June 16%, May 14%, September 13%, August 10%, December ~1% (least popular)**. Fall (Sep–Nov) 35%, summer (Jun–Aug) 33%, winter (Jan–Mar) ~5%. — https://www.theknot.com/content/is-there-an-off-season-for-weddings , https://www.theknot.com/content/fall-most-popular-wedding-season
- **Pittsburgh/Western PA adjustment**: local vendor guides report **September as the #1 month in the Pittsburgh area** (ahead of October, likely because late-Oct weather is already risky), with peak season May–Oct and **December–March effectively off-season**; the Northeast/Great-Lakes belt has "the most dramatic seasonal swing in the country," compressing weddings into ~6 months vs. Florida's inverted Dec–Apr season. Practical model implication: assume Pittsburgh wedding revenue is even *more* concentrated than the national curve — roughly 80%+ in May–Oct, near-zero Jan–Mar, with Sep/Oct together plausibly ~30–35% of annual wedding volume. — https://www.ecoandivoryevents.com/eco-friendly-weddings-and-events-blog/best-months-weddings-pittsburgh , https://centric.events/blog/when-is-wedding-season-a-state-by-state-overview/ , https://tovstudiophoto.com/best-month-to-get-married/

**Corporate/holiday catering**
- **33% of all catering orders happen in Q4**; **December 9 is the #1 day for large-party orders in the US**; December peak pricing runs 10–20% above off-season. — https://cateringfunnels.com/blog/corporate-holiday-party-catering-playbook (secondary aggregation; treat as directional-strong)
- Holiday orders "pick up the week before Thanksgiving and build through the **first three weeks of December**"; there are only ~3 usable event weekends in December before checkout. — https://www.nrn.com/menu-trends/why-catering-can-drive-growth-from-holiday-feasts-to-everyday-celebrations , https://www.thestudiodowntown.net/post/christmas-in-july-why-smart-businesses-book-their-holiday-parties-now
- Average catering order ≈ **$350, ~10x a $35 dine-in ticket** — holiday party weeks move revenue disproportionately to covers. — https://get.chownow.com/blog/restaurant-holiday-marketing-ideas/
- Day-of-week: **only ~10% of weekday office traffic is on Fridays** (Envoy badge data); midweek (Tue–Thu) is when hybrid workers are in office, so drop-off demand concentrates Tue–Thu and Fridays are structurally weak year-round, worst in summer. — https://envoy.com/visitor-management/data-snack-series-summer-fridays , https://fortune.com/2024/07/18/summer-fridays-dead-remote-hybrid-flexible-work-productivity/
- ezCater: 70% of business orders placed in morning hours; 90% of workplace orders are lunch; recurring meal programs +32% YoY (recurring programs *dampen* seasonality vs. one-off event catering). — https://www.ezcater.com/lunchrush/restaurant/catering-business-profitability/ , https://www.qsrmagazine.com/news/ezcater-data-shows-workplace-catering-emerging-as-key-growth-driver-for-restaurants/

**Retail café / bakery**
- USDA ERS: **food-away-from-home sales fall ~7–12% December→January** every year 2022–2025 (food-at-home falls 14–16%). This is the single best-sourced composite monthly number found. — https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=110900
- Independent bakery benchmarks: **holiday-surge periods (Thanksgiving–New Year's plus Easter/Valentine's/Mother's Day) = 25–45% of annual revenue**; in-store bakery categories see **triple-digit lifts** vs. everyday volume at holidays; ~97% of US households serve pie during the holidays. — https://wallefy.ai/bakery-marketing , https://progressivegrocer.com/bakery-has-retailers-rolling-holiday-dough , https://www.sugar.org/blog/happie-holidays/
- December restaurant revenue can run **40–60% above an average month**, with January falling 30–40% from December (European POS data — treat as directional for US). — https://happychef.cloud/en/blog/finance/restaurant-cash-flow-management.html
- January/February are the consensus slowest restaurant months; August is a secondary lull. — https://www.getsauce.com/post/slowest-months-for-restaurants

**Composite** — no single public source publishes a US caterer revenue-by-month index (IBISWorld gates theirs). The Q4=33% figure plus the ERS Dec→Jan drop are the best anchors.

---

## (c) Weekly-level effects to encode in models

1. **Thanksgiving week**: corporate drop-off ≈ 2 working days (Mon–Tue, Wed half); model corporate at ~30–40% of a normal week. Retail/bakery inverts to its **annual peak** (tray and pie pre-orders, Wed pickup crush). Labor should shift from delivery drivers to production/counter.
2. **Dec weeks 1–3**: holiday-party peak; **Dec 9 ±2 days and the first three Fridays/Saturdays of December** are the highest-demand slots of the year; expect stacked large orders and 40%+ above-baseline catering revenue.
3. **Dec 24–31**: corporate catering ≈ zero (offices closed); retail holds through Dec 23–24 (Christmas trays/cookies) then goes quiet; NYE is event-driven only. Model this week near the annual minimum for corporate, moderate-then-dead for retail.
4. **Jan 1–7**: dead across all segments; corporate resumes ~week 2 with kickoff/planning meetings (a real, modelable mini-bump — sales kickoffs cluster in January). — https://www.pipedrive.com/en/blog/sales-kickoff
5. **July 4 week**: corporate at ~50% (bridge-day vacations); adjacent weeks also soft. Memorial Day and Labor Day weeks each lose Monday and run soft Fri.
6. **Summer Fridays / Fridays generally**: near-zero corporate drop-off on Fridays June–August; Fridays weak all year (~10% of office traffic). Weight corporate weekly revenue heavily to Tue–Wed–Thu.
7. **Labor Day → mid-October**: the steepest ramp of the year — back-to-office corporate surge lands on top of the Sep (#1 in PGH)/Oct wedding peak. This is the stretch where under-staffing is most costly.
8. **Weather (Pittsburgh-specific)**: Jan–Feb snow/ice days cancel or postpone corporate orders same-day (treat individual snow days as stochastic downside on Jan–Feb corporate, not a level shift). Outdoor-wedding exposure means late-Oct+ bookings shift indoors or vanish; the effective outdoor season is May–mid-October.
9. **One-off retail bumps**: Valentine's Day, Easter week, Mother's Day (strong brunch/café day), graduation weekends (late May–mid June, party-tray demand).

**Modeling takeaway**: the composite curve for this business mix is **bimodal** — a Sep–Oct peak (weddings + corporate surge) and a Dec 1–21 peak (parties + retail), separated by a soft Jul–Aug trough and a hard Jan trough, with the Dec 24–Jan 7 fortnight as the annual floor. Peak-to-trough on the catering side plausibly runs 2.5–4x (Q4 alone = one-third of orders); retail café is much flatter (~±10–15%) except for the holiday bakery spike, so labor flexing should concentrate on catering production/delivery staff rather than counter staff.

---

## Validation against own data (comp sheet, 2023–2025 weekly revenue)

Monthly share of annual revenue by year:

| Month | 2023 | 2024 | 2025 |
|---|---|---|---|
| Jan | 5.0% | 3.9% | 3.6% |
| Feb | 6.7% | 3.9% | 3.7% |
| Mar | 5.7% | 4.9% | 6.0% |
| Apr | 8.8% | 7.6% | 5.5% |
| May | 10.1% | 11.6% | 9.1% |
| Jun | 10.4% | 9.6% | 11.8% |
| Jul | 7.3% | 8.2% | 7.1% |
| Aug | 12.0% | 8.1% | 11.1% |
| Sep | 9.4% | 12.9% | 11.9% |
| Oct | 9.3% | 11.5% | 9.1% |
| Nov | 11.1% | 8.0% | 13.4% |
| Dec | 4.3% | 9.8% | 7.8% |

Weekly detail confirms the December cliff: in 2025 the week of Nov 30–Dec 6 did **$252.6k** (2.4× the $107k average week) and Dec 7–13 did $196.7k, then Dec 21–27 collapsed to $60.6k and Dec 28–31 to $32.2k. The July 4th week and Thanksgiving week dips also show up every year. Jan–Feb are consistently the annual floor (3.6–6.7%).
