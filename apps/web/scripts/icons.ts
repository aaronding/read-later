// Renders every app and extension icon from the logo in packages/brand/logo.
// Run it after changing those SVGs, and commit what it writes:
//
//   pnpm icons
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const logo = (file: string) => new URL(`../../../packages/brand/logo/${file}`, import.meta.url);
const web = (file: string) => new URL(`../${file}`, import.meta.url);
const extension = (file: string) => new URL(`../../extension/static/icons/${file}`, import.meta.url);

// The icons are drawn from icon.svg, or from icon-small.svg, drawn on a pixel
// grid, at 16 and 32 px.
const icons: [source: string, size: number, target: URL][] = [
  ["icon-small.svg", 16, extension("icon-16.png")],
  ["icon-small.svg", 32, extension("icon-32.png")],
  ["icon.svg", 48, extension("icon-48.png")],
  ["icon.svg", 128, extension("icon-128.png")],
  ["icon.svg", 192, web("public/icons/icon-192.png")],
  ["icon.svg", 512, web("public/icons/icon-512.png")],
  ["maskable.svg", 512, web("public/icons/maskable-512.png")],
  ["apple-icon.svg", 180, web("src/app/apple-icon.png")],
];

for (const [source, size, target] of icons) {
  const svg = readFileSync(logo(source));
  const viewBox = Number(/viewBox="0 0 (\d+)/.exec(svg.toString())?.[1]);
  // Draw the SVG at the icon's own size rather than scaling a larger picture
  // down, so icon-small.svg's edges land on whole pixels.
  await sharp(svg, { density: (72 * size) / viewBox })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(target));
}
// The favicon, and the light and dark logos the pages show.
copyFileSync(logo("icon-small.svg"), web("src/app/icon.svg"));
copyFileSync(logo("mark.svg"), web("public/icons/logo.svg"));
copyFileSync(logo("mark-dark.svg"), web("public/icons/logo-dark.svg"));
console.log(`Wrote ${icons.length} PNG icons and 3 SVGs.`);
