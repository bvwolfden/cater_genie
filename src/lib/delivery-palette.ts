// Driver lane colors — categorical identity, fixed assignment order (never
// cycled; validated for CVD separation against the white card surface).
// Shared by the day board and the map so a driver is one color everywhere.
export const DRIVER_COLORS = ["#FF385C", "#00A699", "#7C5CE0", "#B8860B"] as const;

export const driverColor = (index: number): string =>
  DRIVER_COLORS[index] ?? "#717171"; // 5th+ driver: neutral ink-2 (label carries identity)
