/**
 * Product decisions still open in the BRD (section 14). Flip these once decided.
 */
export const FEATURES = {
  /** BRD Q-1: final product name. */
  productName: 'relaxicise',
  /**
   * BRD Q-4: offer an "I did the reps" manual confirmation when the camera is blocked.
   * Off until the decision is made; the always-available "Skip exercise" (logged in the
   * summary) is the fallback in the meantime.
   */
  manualConfirmFallback: false,
} as const;
