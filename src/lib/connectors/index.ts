import type { Connector } from "./types";
import { cloverConnector } from "./clover";
import { caterTraxConnector } from "./catertrax";
import { whenIWorkConnector } from "./wheniwork";
import { quickbooksConnector } from "./quickbooks";

export const connectors: Connector[] = [
  cloverConnector,
  caterTraxConnector,
  whenIWorkConnector,
  quickbooksConnector,
];

export function connectorStatuses() {
  return connectors.map((c) => c.status());
}

export * from "./types";
