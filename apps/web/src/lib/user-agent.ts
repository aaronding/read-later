// What a request's User-Agent says about the browser and system: the extension's
// token is named after them, and the homepage shows the keyboard shortcut for the system.

// The first match wins: Edge and Opera also say Chrome, and Android also says Linux.
const BROWSERS: [RegExp, string][] = [
  [/Edg(A|iOS)?\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
];
const SYSTEMS: [RegExp, string][] = [
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

/** The browser and system a user agent names. Brave and Vivaldi say Chrome. */
export function browserAndSystem(userAgent: string | null): { browser?: string; system?: string } {
  const ua = userAgent ?? "";
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1],
    system: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1],
  };
}
