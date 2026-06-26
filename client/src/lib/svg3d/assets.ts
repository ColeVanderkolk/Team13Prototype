export type MilestoneSymbol =
  | "network"
  | "equilibrium"
  | "clone"
  | "vantage"
  | "galaxy"
  | "polyomino";

export interface MilestoneAsset {
  name: string;
  subtitle: string;
  markup: string;
}

export const milestoneAssets: Record<MilestoneSymbol, MilestoneAsset> = {
  network: {
    name: "Network",
    subtitle: "The Signal",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M60 12L20 108H42L60 62L78 108H100L60 12Z" fill="#080808"/>
</svg>`.trim(),
  },
  equilibrium: {
    name: "Equilibrium",
    subtitle: "The Balance",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <polygon points="60,14 52,28 68,28" fill="#080808"/>
  <polygon points="49,36 71,36 79,52 41,52" fill="#080808"/>
  <polygon points="38,60 82,60 90,76 30,76" fill="#080808"/>
  <polygon points="27,84 93,84 106,106 14,106" fill="#080808"/>
</svg>`.trim(),
  },
  clone: {
    name: "Clone",
    subtitle: "The Echo",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 52C30 48 33 46 36 46C39 46 42 48 42 52V64H30V52Z" fill="#080808"/>
  <path d="M42 20C42 16 45 14 48 14C51 14 54 16 54 20V64H42V20Z" fill="#080808"/>
  <path d="M54 12C54 8 57 6 60 6C63 6 66 8 66 12V64H54V12Z" fill="#080808"/>
  <path d="M66 20C66 16 69 14 72 14C75 14 78 16 78 20V64H66V20Z" fill="#080808"/>
  <path d="M78 36C78 32 81 30 84 30C87 30 90 32 90 36V64H78V36Z" fill="#080808"/>
  <path d="M30 64H90V90C90 100 82 110 60 110C38 110 30 100 30 90V64Z" fill="#080808"/>
</svg>`.trim(),
  },
  vantage: {
    name: "Vantage",
    subtitle: "The Sight",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="18" stroke="#080808" stroke-width="6" fill="none"/>
  <polygon points="60,8 52,32 68,32" fill="#080808"/>
  <polygon points="60,112 68,88 52,88" fill="#080808"/>
  <polygon points="112,60 88,52 88,68" fill="#080808"/>
  <polygon points="8,60 32,68 32,52" fill="#080808"/>
</svg>`.trim(),
  },
  galaxy: {
    name: "Galaxy",
    subtitle: "The Expanse",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M54 12L60 52L38 30Z" fill="#080808"/>
  <path d="M108 54L68 60L90 38Z" fill="#080808"/>
  <path d="M66 108L60 68L82 90Z" fill="#080808"/>
  <path d="M12 66L52 60L30 82Z" fill="#080808"/>
  <circle cx="60" cy="60" r="6" fill="#080808"/>
</svg>`.trim(),
  },
  polyomino: {
    name: "Polyomino",
    subtitle: "The Pattern",
    markup: `
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="16" y="16" width="24" height="24" fill="#080808"/>
  <rect x="48" y="16" width="24" height="24" fill="#080808"/>
  <rect x="80" y="16" width="24" height="24" fill="#080808"/>
  <rect x="16" y="48" width="24" height="24" fill="#080808"/>
  <rect x="48" y="48" width="24" height="24" fill="#080808"/>
  <rect x="80" y="48" width="24" height="24" fill="#080808"/>
  <rect x="16" y="80" width="24" height="24" fill="#080808"/>
  <rect x="48" y="80" width="24" height="24" fill="#080808"/>
  <rect x="80" y="80" width="24" height="24" fill="#080808"/>
</svg>`.trim(),
  },
};

export function symbolKeyFromName(symbolName: string): MilestoneSymbol | null {
  const key = symbolName.toLowerCase() as MilestoneSymbol;
  return key in milestoneAssets ? key : null;
}
