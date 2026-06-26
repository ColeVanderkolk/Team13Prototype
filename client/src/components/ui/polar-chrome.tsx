/** Cold polar HUD chrome (sky / ice) — shared by game HUD and lobby panels. */
export const POLAR_HUD = {
  border: "rgba(56, 189, 248, 0.2)",
  barBorder: "rgba(56, 189, 248, 0.2)",
  barInset: "rgba(14, 165, 233, 0.2)",
  connectorFrom: "rgba(255,255,255,0.2)",
  connectorVia: "rgba(56, 189, 248, 0.2)",
  connectorTo: "rgba(125, 211, 252, 0.2)",
  marker: "#7dd3fc",
  markerRing: "rgba(186, 230, 253, 0.2)",
} as const;

/** Tiny corner L-brackets (sky hairline). Parent should be `relative overflow-hidden`. */
export function HudCornerLs() {
  return null;
}
