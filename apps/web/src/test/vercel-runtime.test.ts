// Vercel's Node runtime starts with require() of ES modules turned off, which
// a local Node 22.12 or later allows, so the packages Next.js leaves in
// node_modules for the server (jsdom and pg) must load without it. jsdom 27
// and later don't: html-encoding-sniffer requires the ES-only @exodus/bytes.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const VERCEL_NODE_FLAGS = ["--no-experimental-require-module", "--no-experimental-detect-module"];
const appDir = path.resolve(import.meta.dirname, "../..");

const runAsOnVercel = (script: string) =>
  execFileSync(process.execPath, [...VERCEL_NODE_FLAGS, "-e", script], { cwd: appDir, encoding: "utf8" }).trim();

describe("the packages the server loads from node_modules, as on Vercel", () => {
  it.each(["jsdom", "pg"])("%s loads", (name) => {
    expect(runAsOnVercel(`require(${JSON.stringify(name)}); console.log("loaded")`)).toBe("loaded");
  });

  it("jsdom parses a page", () => {
    const script = `const { JSDOM } = require("jsdom"); console.log(new JSDOM("<h1>Ferries</h1>").window.document.querySelector("h1").textContent)`;
    expect(runAsOnVercel(script)).toBe("Ferries");
  });
});
