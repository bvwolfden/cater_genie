"use client";

import { useState } from "react";
import Link from "next/link";
import type { EntryContext, DailyEntryInput } from "@/lib/entry";
import { money, weekdayDate } from "@/lib/format";
import { Card } from "./primitives";
import { cn } from "@/lib/cn";
import { ChevronLeft, ChevronRight, Check, DollarSign, Users, Banknote, Utensils, Store, Truck, PartyPopper, Receipt, ClipboardCheck } from "lucide-react";

type Vals = Record<string, number | null>;

const STEPS = [
  {
    key: "sales",
    title: "Today's sales",
    hint: "Enter each business line — we'll total them.",
    fields: [
      { k: "cafeSales", label: "Café / retail", icon: Store },
      { k: "cateringSales", label: "Corporate catering (delivery)", icon: Truck },
      { k: "eventsSales", label: "Events", icon: PartyPopper },
    ],
    money: true,
  },
  { key: "tax", title: "Sales tax collected", fields: [{ k: "tax", label: "Tax", icon: Receipt }], money: true },
  {
    key: "labor",
    title: "Labor",
    fields: [
      { k: "laborHours", label: "Total hours", icon: Users, money: false },
      { k: "laborCost", label: "Labor $", icon: DollarSign, money: true },
    ],
  },
  { key: "food", title: "Food purchases", fields: [{ k: "foodPurchases", label: "Food purchases", icon: Utensils }], money: true },
  {
    key: "balances",
    title: "Account balances",
    hint: "From QuickBooks — optional, enter what you have.",
    optional: true,
    fields: [
      { k: "operating", label: "Operating", icon: Banknote },
      { k: "payroll", label: "Payroll", icon: Banknote },
      { k: "merchant", label: "Merchant", icon: Banknote },
      { k: "savings", label: "Savings", icon: Banknote },
      { k: "holding", label: "Holding", icon: Banknote },
      { k: "ccProcessing", label: "CC Processing", icon: Banknote },
    ],
    money: true,
  },
];

const EMPTY: Vals = {
  cafeSales: null, cateringSales: null, eventsSales: null, tax: null, laborHours: null, laborCost: null,
  foodPurchases: null, operating: null, payroll: null, merchant: null, savings: null, holding: null, ccProcessing: null,
};
const nextDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function DailyEntryWizard({ ctx }: { ctx: EntryContext }) {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(ctx.targetDate);
  const [notes, setNotes] = useState(ctx.existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const e = ctx.existing;
  const [vals, setVals] = useState<Vals>({
    cafeSales: e?.cafeSales ?? null, cateringSales: e?.cateringSales ?? null, eventsSales: e?.eventsSales ?? null,
    tax: e?.tax ?? null, laborHours: e?.laborHours ?? null, laborCost: e?.laborCost ?? null, foodPurchases: e?.foodPurchases ?? null,
    operating: e?.operating ?? null, payroll: e?.payroll ?? null, merchant: e?.merchant ?? null,
    savings: e?.savings ?? null, holding: e?.holding ?? null, ccProcessing: e?.ccProcessing ?? null,
  });

  const total = STEPS.length + 1; // + review
  const set = (k: string, v: string) => setVals((p) => ({ ...p, [k]: v === "" ? null : Number(v) }));
  const netSales = ["cafeSales", "cateringSales", "eventsSales"].reduce((s, k) => s + (vals[k] ?? 0), 0);
  const refBal = ctx.lastBalances;

  async function save() {
    setSaving(true);
    try {
      const payload: DailyEntryInput = { date, notes, ...vals } as DailyEntryInput;
      const res = await fetch("/api/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) setDone(true);
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <Card className="card-pad mx-auto max-w-lg text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-mint/15 text-mint">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-ink">Saved — {weekdayDate(date)}</h2>
        <p className="mt-1 text-sm text-ink-2">Net sales {money(netSales)} recorded. The dashboard is updated.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href={`/?date=${date}`} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">View dashboard</Link>
          <button
            onClick={() => { setVals({ ...EMPTY }); setNotes(""); setDate(nextDay(date)); setStep(0); setDone(false); }}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-2 hover:bg-canvas-700"
          >
            Enter another day
          </button>
        </div>
      </Card>
    );
  }

  const isReview = step === STEPS.length;
  const cur = STEPS[step];
  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <Card className="card-pad mx-auto max-w-lg">
      {/* progress */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-ink-3">
          <span>Daily check-in · {weekdayDate(date)}</span>
          <span>{Math.min(step + 1, total)} / {total}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-600">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {!isReview ? (
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{cur.title}</h2>
            {cur.optional && <span className="pill bg-canvas-600 text-[10px] text-ink-3">optional</span>}
          </div>
          {step === 0 && (
            <input type="date" value={date} max={ctx.targetDate > new Date().toISOString().slice(0, 10) ? date : undefined}
              onChange={(ev) => setDate(ev.target.value)}
              className="mb-3 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink outline-none focus:border-brand/50" />
          )}
          {cur.hint && <p className="mb-3 text-xs text-ink-2">{cur.hint}</p>}

          <div className="space-y-2.5">
            {cur.fields.map((f) => {
              const Icon = f.icon;
              const isMoney = "money" in f ? (f as { money?: boolean }).money !== false : cur.money;
              const ref = cur.key === "balances" ? refBal[f.k === "ccProcessing" ? "CC_PROCESSING" : f.k.toUpperCase()] : undefined;
              return (
                <div key={f.k} className="flex items-center gap-2 rounded-xl border border-line bg-canvas-700 px-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-ink-3" />
                  <label className="flex-1 text-sm text-ink-2">{f.label}</label>
                  <div className="flex items-center gap-1">
                    {isMoney && <span className="text-ink-3">$</span>}
                    <input
                      type="number" inputMode="decimal" step="any"
                      value={vals[f.k] ?? ""}
                      onChange={(ev) => set(f.k, ev.target.value)}
                      placeholder={ref != null ? String(Math.round(ref)) : "0"}
                      className="w-28 rounded-md border border-line bg-white px-2 py-1.5 text-right text-sm font-medium tabular-nums text-ink outline-none focus:border-brand/50"
                      autoFocus={f === cur.fields[0]}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {cur.key === "sales" && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/5 px-3 py-2 text-sm">
              <span className="text-ink-2">Net sales</span>
              <span className="font-semibold tabular-nums text-brand">{money(netSales)}</span>
            </div>
          )}
          {ctx.reference.date && step === 0 && (
            <p className="mt-2 text-[11px] text-ink-3">Last recorded ({ctx.reference.date}): net sales {money(ctx.reference.netSales)}.</p>
          )}
        </div>
      ) : (
        // review
        <div>
          <div className="mb-2 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold text-ink">Review &amp; save</h2>
          </div>
          <dl className="divide-y divide-line text-sm">
            {[
              ["Net sales", money(netSales)],
              ["— Café", money(vals.cafeSales)],
              ["— Corporate catering", money(vals.cateringSales)],
              ["— Events", money(vals.eventsSales)],
              ["Tax", money(vals.tax)],
              ["Labor hours", vals.laborHours != null ? `${vals.laborHours} h` : "—"],
              ["Labor $", money(vals.laborCost)],
              ["Food purchases", money(vals.foodPurchases)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5">
                <dt className={cn("text-ink-2", String(k).startsWith("—") && "pl-3 text-ink-3")}>{k}</dt>
                <dd className="font-medium tabular-nums text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="Notes (optional)…"
            className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand/50" rows={2} />
        </div>
      )}

      {/* nav */}
      <div className="mt-5 flex items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-canvas-700 disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {!isReview ? (
          <button onClick={() => setStep((s) => s + 1)} className="flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">
            {cur.optional ? "Skip / Next" : "Next"} <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button onClick={save} disabled={saving} className="flex items-center gap-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            <Check className="h-4 w-4" /> {saving ? "Saving…" : ctx.isEdit ? "Update day" : "Save day"}
          </button>
        )}
      </div>
    </Card>
  );
}
