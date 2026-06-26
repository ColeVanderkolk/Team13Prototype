/**
 * Device performance tier — coarse classification used to scale shader
 * costs (DPR caps, particle counts, bloom on/off) on lower-end hardware.
 *
 * Detection is intentionally simple (no FPS probing, no benchmark) —
 * a quick CPU/memory snapshot at module load is "good enough" for
 * tuning and avoids the complexity of dynamic quality switching.
 *
 * Signals:
 *   - `prefers-reduced-motion: reduce` → always treat as low
 *   - `navigator.hardwareConcurrency` → CPU core count
 *   - `navigator.deviceMemory` → device RAM in GB (Chromium only)
 */

export type PerfTier = "high" | "mid" | "low";

let cached: PerfTier | null = null;

export function getPerfTier(): PerfTier {
  if (cached) return cached;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    cached = "high";
    return cached;
  }
  // Reduced-motion users get the calmest tier regardless of hardware.
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      cached = "low";
      return cached;
    }
  } catch {
    // ignore — older browsers may not support matchMedia
  }
  const cpu = navigator.hardwareConcurrency ?? 4;
  // navigator.deviceMemory is only on Chromium; treat undefined as plenty.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (cpu < 4 || (memory !== undefined && memory < 4)) {
    cached = "low";
  } else if (cpu < 8 || (memory !== undefined && memory < 8)) {
    cached = "mid";
  } else {
    cached = "high";
  }
  return cached;
}

/** Reasonable DPR cap by tier — keeps GPU pixel work bounded. */
export function getDprCap(): number {
  const tier = getPerfTier();
  if (tier === "low") return 1.0;
  if (tier === "mid") return 1.5;
  return 2.0;
}

/** Multiplier to apply to particle counts / loop iterations so heavier
 *  scenes auto-scale on weaker devices. */
export function getQualityMul(): number {
  const tier = getPerfTier();
  if (tier === "low") return 0.4;
  if (tier === "mid") return 0.7;
  return 1.0;
}

/** Whether expensive post-processing (Bloom etc.) should be enabled. */
export function shouldEnableBloom(): boolean {
  return getPerfTier() !== "low";
}
