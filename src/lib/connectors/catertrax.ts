import { existsSync, readdirSync } from "node:fs";
import type { Connector, ConnectorStatus, PullResult } from "./types";
import { ConnectorUnavailableError } from "./types";

// CaterTrax — corporate delivery. Discovery: NO public API. Owner is
// Volaris/Constellation Software; integrations go through Professional
// Services. The realistic path is a scheduled CSV/Excel **report export**
// dropped to us (SFTP/email), which this connector ingests from a watch dir.
//
// Until that report feed is configured with the vendor, there's nothing to
// pull. Admin portal creds (see CATERTRAX_URL in .env) are used to set up the
// scheduled report.

const DROP_DIR = process.env.CATERTRAX_DROP_DIR || "./drop/catertrax";

export const caterTraxConnector: Connector = {
  status(): ConnectorStatus {
    const hasDrops = existsSync(DROP_DIR) && readdirSync(DROP_DIR).length > 0;
    return {
      system: "CATERTRAX",
      label: "CaterTrax",
      category: "delivery",
      configured: hasDrops,
      method: "scheduled-report",
      readiness: hasDrops
        ? "Report drop detected — ingest configured."
        : "No public API. Configure a scheduled CSV/Excel report export (vendor) to drop into CATERTRAX_DROP_DIR.",
    };
  },

  async pull(): Promise<PullResult> {
    if (!existsSync(DROP_DIR) || readdirSync(DROP_DIR).length === 0) {
      throw new ConnectorUnavailableError(
        "CATERTRAX",
        "No CaterTrax report drop found. CaterTrax has no API — needs a vendor-configured scheduled report export (SFTP/email)."
      );
    }
    // Future: parse the dropped CSV/XLSX export into DailySales rows here.
    throw new ConnectorUnavailableError(
      "CATERTRAX",
      "Report drop parser not yet implemented — pending the agreed export schema."
    );
  },
};
