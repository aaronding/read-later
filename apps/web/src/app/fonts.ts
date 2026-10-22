import { Atkinson_Hyperlegible, Literata, Merriweather, Source_Serif_4 } from "next/font/google";

// The reading fonts that devices don't have (see READING_FONTS in
// lib/appearance.ts). next/font downloads them from Google Fonts when the app
// is built and serves them from the app itself, so browsers never contact
// Google. They aren't preloaded: a browser fetches one only once it's chosen.

const literata = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  preload: false,
  variable: "--font-literata",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  preload: false,
  variable: "--font-source-serif",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  style: ["normal", "italic"],
  preload: false,
  variable: "--font-merriweather",
});

// Not a variable font: regular and bold are the weights articles use.
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  preload: false,
  variable: "--font-atkinson",
});

/** Class names that define the fonts' CSS variables, for <html>. */
export const fontVariables = [literata, sourceSerif, merriweather, atkinson].map((font) => font.variable).join(" ");
