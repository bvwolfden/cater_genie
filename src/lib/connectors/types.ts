import type { SalesChannel, SourceSystem, AccountType } from "@prisma/client";

export type ConnectorCategory = "retail" | "delivery" | "labor" | "accounting";

export interface DailySalesInput {
  date: string; // yyyy-mm-dd
  channel: SalesChannel;
  netSales?: number;
  tax?: number;
  grossSales?: number;
  orderCount?: number;
}

export interface LaborEntryInput {
  date: string;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  department?: string;
  position?: string;
  regularHours?: number;
  otHours?: number;
  hourlyRate?: number;
  paidTotal?: number;
}

export interface BalanceInput {
  date: string;
  account: AccountType;
  balance: number;
}

export interface PullResult {
  sales?: DailySalesInput[];
  labor?: LaborEntryInput[];
  balances?: BalanceInput[];
  note?: string;
}

export interface ConnectorStatus {
  system: SourceSystem;
  label: string;
  category: ConnectorCategory;
  configured: boolean;
  /** What we'd do to make it live — surfaced on the dashboard. */
  readiness: string;
  /** The chosen integration mechanism from discovery. */
  method: "rest-api" | "scheduled-report" | "oauth-rest" | "manual";
}

/** Raised when a connector can't pull because access isn't wired up yet. */
export class ConnectorUnavailableError extends Error {
  constructor(public readonly system: SourceSystem, message: string) {
    super(message);
    this.name = "ConnectorUnavailableError";
  }
}

export interface Connector {
  status(): ConnectorStatus;
  /** Pull a single day's data. Throws ConnectorUnavailableError if not wired. */
  pull(date: Date): Promise<PullResult>;
}
