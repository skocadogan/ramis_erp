// ============================================================
// Stock Man — Runtime theme CSS variables
//
// global.css :root / .dark değerlerinin JS karşılığı.
// NativeWind'de manuel tema seçimi için kök View'a vars()
// enjekte edilir (nativewind/theme-toggle deseni).
// ============================================================

import { vars } from "nativewind";

const light = {
  "--background": "247 248 250",
  "--foreground": "15 23 42",
  "--card": "255 255 255",
  "--card-foreground": "15 23 42",
  "--popover": "255 255 255",
  "--popover-foreground": "15 23 42",
  "--primary": "30 64 175",
  "--primary-foreground": "255 255 255",
  "--secondary": "241 245 249",
  "--secondary-foreground": "15 23 42",
  "--accent": "245 158 11",
  "--accent-foreground": "31 41 55",
  "--muted": "241 245 249",
  "--muted-foreground": "100 116 139",
  "--destructive": "220 38 38",
  "--destructive-foreground": "255 255 255",
  "--success": "5 150 105",
  "--success-foreground": "255 255 255",
  "--warning": "245 158 11",
  "--warning-foreground": "31 41 55",
  "--info": "14 165 233",
  "--info-foreground": "255 255 255",
  "--border": "226 232 240",
  "--input": "226 232 240",
  "--ring": "30 64 175",
} as const;

const dark = {
  "--background": "11 17 32",
  "--foreground": "226 232 240",
  "--card": "17 24 39",
  "--card-foreground": "226 232 240",
  "--popover": "17 24 39",
  "--popover-foreground": "226 232 240",
  "--primary": "59 130 246",
  "--primary-foreground": "255 255 255",
  "--secondary": "30 41 59",
  "--secondary-foreground": "226 232 240",
  "--accent": "251 191 36",
  "--accent-foreground": "17 24 39",
  "--muted": "30 41 59",
  "--muted-foreground": "148 163 184",
  "--destructive": "239 68 68",
  "--destructive-foreground": "255 255 255",
  "--success": "16 185 129",
  "--success-foreground": "255 255 255",
  "--warning": "251 191 36",
  "--warning-foreground": "17 24 39",
  "--info": "56 189 248",
  "--info-foreground": "17 24 39",
  "--border": "31 41 55",
  "--input": "31 41 55",
  "--ring": "59 130 246",
} as const;

export const lightThemeVars = vars(light);
export const darkThemeVars = vars(dark);

function rgbTripletToHex(triplet: string): string {
  const parts = triplet.split(" ").map(Number);
  const [r = 0, g = 0, b = 0] = parts;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

export type TabBarColors = {
  active: string;
  inactive: string;
  background: string;
  border: string;
};

export function getTabBarColors(isDark: boolean): TabBarColors {
  const palette = isDark ? dark : light;
  return {
    active: rgbTripletToHex(palette["--primary"]),
    inactive: rgbTripletToHex(palette["--muted-foreground"]),
    background: rgbTripletToHex(palette["--card"]),
    border: rgbTripletToHex(palette["--border"]),
  };
}

export type SemanticIconColors = {
  foreground: string;
  primary: string;
  muted: string;
};

/** Header / ikon renkleri — light/dark tema ile uyumlu. */
export function getSemanticIconColors(isDark: boolean): SemanticIconColors {
  const palette = isDark ? dark : light;
  return {
    foreground: rgbTripletToHex(palette["--foreground"]),
    primary: rgbTripletToHex(palette["--primary"]),
    muted: rgbTripletToHex(palette["--muted-foreground"]),
  };
}
