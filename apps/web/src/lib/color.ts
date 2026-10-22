// Small helpers for #rrggbb colors, used to derive the reading themes' shades.

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Expected a #rrggbb color, got "${hex}".`);
  return [Number.parseInt(match[1]!, 16), Number.parseInt(match[2]!, 16), Number.parseInt(match[3]!, 16)];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of `color` mixed into `base`, like CSS `color-mix(in srgb, color amount, base)`. */
export function mixColors(color: string, base: string, amount: number): string {
  const [a, b] = [toRgb(color), toRgb(base)];
  return toHex([0, 1, 2].map((i) => a[i]! * amount + b[i]! * (1 - amount)) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
