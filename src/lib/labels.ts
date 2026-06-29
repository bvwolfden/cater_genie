// Business-facing names for the revenue streams. The owner thinks in terms of
// their lines of business, not the software that happens to run each one.
// (Source-system names like Clover/CaterTrax stay on the Data Sources panel,
// which is specifically about integrations.)
export const channelLabel: Record<string, string> = {
  CAFE_RETAIL: "Café",
  CATERTRAX: "Corporate Catering",
  CATEREASE: "Events",
  ALOHA: "Restaurant",
  OTHER: "Other",
};

export const channelLabelOf = (c: string) => channelLabel[c] ?? c;
