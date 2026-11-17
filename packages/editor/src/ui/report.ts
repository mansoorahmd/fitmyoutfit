/**
 * When the shell tells its host that the design changed (E3e). The host saves on every report and shows
 * "Saved on this device" after it, so a report that is not a change (the start card closing because the coach
 * tapped an item, with the design as it was given) must not be sent.
 */
export interface ReportInput {
  /** The first design the shell looks at (nothing reported before). */
  first: boolean;
  /** This design is the one reported last (only the start card's state changed). */
  sameDesign: boolean;
  /** This design is the one the shell was given at the start: nobody has changed it. */
  isInitial: boolean;
  /** On the first look: the start card's state differs from what the host was told to show. */
  startedDiffers: boolean;
}

export function shouldReportChange(input: ReportInput): boolean {
  if (input.first) return input.startedDiffers;
  return !(input.sameDesign && input.isInitial);
}
