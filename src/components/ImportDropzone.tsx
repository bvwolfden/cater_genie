"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UploadCloud, FileSpreadsheet, Check, X, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Batch = {
  id: number;
  filename: string;
  kind: string | null;
  status: string;
  summary: string | null;
  error: string | null;
  rowsWritten: number;
  createdAt: string;
  parsed: {
    days?: Record<string, unknown>[];
    labor?: Record<string, unknown>[];
    bookings?: Record<string, unknown>[];
  } | null;
};

const usd = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";

const statusStyle: Record<string, string> = {
  PENDING: "bg-amber/10 text-amber border-amber/30",
  COMMITTED: "bg-mint/10 text-mint border-mint/30",
  REJECTED: "bg-ink-3/10 text-ink-3 border-line",
  FAILED: "bg-rose/10 text-rose border-rose/30",
};

function PreviewTable({ rows, cols }: { rows: Record<string, unknown>[]; cols: { key: string; label: string; money?: boolean }[] }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-ink-3">
            {cols.map((c) => (
              <th key={c.key} className="px-2 py-1.5 font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 40).map((r, i) => (
            <tr key={i} className="border-b border-line/50 text-ink-2">
              {cols.map((c) => (
                <td key={c.key} className="px-2 py-1">
                  {c.money ? usd(r[c.key]) : r[c.key] == null ? "—" : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 40 && <div className="px-2 py-1 text-[10px] text-ink-3">…and {rows.length - 40} more rows</div>}
    </div>
  );
}

function BatchCard({ batch, onAction, busy }: { batch: Batch; onAction: (id: number, action: "commit" | "reject") => void; busy: boolean }) {
  const [open, setOpen] = useState(batch.status === "PENDING");
  const p = batch.parsed ?? {};
  const days = p.days ?? [];
  const labor = p.labor ?? [];
  const bookings = p.bookings ?? [];

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-3" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />}
        <FileSpreadsheet className="h-4 w-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-ink">{batch.filename}</div>
          <div className="truncate text-[11px] text-ink-3">
            {batch.summary ?? batch.error ?? "—"}
            {batch.status === "COMMITTED" && ` · ${batch.rowsWritten} rows written`}
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", statusStyle[batch.status] ?? statusStyle.REJECTED)}>
          {batch.status}
        </span>
      </button>

      {open && (
        <div className="border-t border-line px-4 py-3">
          {batch.error && <p className="mb-2 text-xs text-rose">{batch.error}</p>}
          {days.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Daily rows · {days.length}</div>
              <PreviewTable
                rows={days}
                cols={[
                  { key: "date", label: "Date" },
                  { key: "cafeSales", label: "Cafe", money: true },
                  { key: "cateringSales", label: "CaterTrax", money: true },
                  { key: "eventsSales", label: "Events", money: true },
                  { key: "laborCost", label: "Labor $", money: true },
                  { key: "laborHours", label: "Hours" },
                  { key: "foodPurchases", label: "Food", money: true },
                ]}
              />
            </div>
          )}
          {labor.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Labor rows · {labor.length}</div>
              <PreviewTable
                rows={labor}
                cols={[
                  { key: "date", label: "Date" },
                  { key: "firstName", label: "First" },
                  { key: "lastName", label: "Last" },
                  { key: "department", label: "Dept" },
                  { key: "regularHours", label: "Reg h" },
                  { key: "otHours", label: "OT h" },
                  { key: "paidTotal", label: "Paid", money: true },
                ]}
              />
            </div>
          )}
          {bookings.length > 0 && (
            <div className="mb-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Bookings · {bookings.length}</div>
              <PreviewTable
                rows={bookings}
                cols={[
                  { key: "eventDate", label: "Date" },
                  { key: "name", label: "Event" },
                  { key: "status", label: "Status" },
                  { key: "guests", label: "Guests" },
                  { key: "revenue", label: "Revenue", money: true },
                ]}
              />
            </div>
          )}

          {batch.status === "PENDING" && (
            <div className="flex gap-2">
              <button
                onClick={() => onAction(batch.id, "commit")}
                disabled={busy}
                className="pill bg-brand text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-3 w-3" /> Commit to dashboard
              </button>
              <button
                onClick={() => onAction(batch.id, "reject")}
                disabled={busy}
                className="pill border border-line bg-white text-ink-2 transition hover:border-rose/40 hover:text-rose disabled:opacity-50"
              >
                <X className="h-3 w-3" /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ImportDropzone() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/import");
    if (res.ok) setBatches((await res.json()).batches);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function upload(files: FileList | File[]) {
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/import", { method: "POST", body: fd });
        if (!res.ok && res.status !== 422) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Upload failed (${res.status})`);
        }
      }
      await refresh();
    } finally {
      setUploading(false);
    }
  }

  async function onAction(id: number, action: "commit" | "reject") {
    setBusy(true);
    try {
      const res = await fetch(`/api/import/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `${action} failed`);
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "card grid cursor-pointer place-items-center border-2 border-dashed px-6 py-10 text-center transition",
          dragOver ? "border-brand bg-brand/5" : "border-line hover:border-brand/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.txt,.tsv"
          className="hidden"
          onChange={(e) => e.target.files?.length && upload(e.target.files)}
        />
        {uploading ? (
          <div className="flex items-center gap-2 text-sm text-ink-2">
            <Loader2 className="h-5 w-5 animate-spin text-brand" /> Parsing with AI…
          </div>
        ) : (
          <>
            <UploadCloud className="mb-2 h-8 w-8 text-brand" />
            <div className="text-sm font-medium text-ink">Drop an export here — or click to choose</div>
            <div className="mt-1 text-xs text-ink-3">
              Caterease query · CaterTrax report · When I Work timesheet · daily tracker — XLSX, CSV, PDF, or screenshot
            </div>
          </>
        )}
      </div>

      {error && <p className="text-xs text-rose">{error}</p>}

      {batches.map((b) => (
        <BatchCard key={b.id} batch={b} onAction={onAction} busy={busy} />
      ))}
      {!batches.length && <p className="text-center text-xs text-ink-3">No imports yet.</p>}
    </div>
  );
}
