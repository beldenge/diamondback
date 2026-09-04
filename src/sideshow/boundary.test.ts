/**
 * The import wall, checked in both directions.
 *
 * Dust: Resurrected is a faithful reconstruction of DF.EXE. No Sideshow
 * feature may add a line, a branch or a flag to that path — so the
 * Sideshow is a *sibling* of `src/play/`, not a mode of it, and the two
 * are only allowed to meet on stateless film/geometry helpers.
 *
 * This test is the mechanism behind that promise. Deleting it, or adding
 * an exception to it, is a decision to give the guarantee up.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..", "..");
const SIDESHOW = resolve(ROOT, "src", "sideshow");

/** Stateful engine. The Sideshow may never reach any of it. */
const FORBIDDEN = [
  /(^|\/)play\/host(\.ts)?$/,
  /(^|\/)play\/game(\.ts)?$/,
  /(^|\/)play\/sandbox(\.ts)?$/,
  /(^|\/)play\/ui(\.ts)?$/,
  /(^|\/)play\/save(\.ts)?$/,
  /(^|\/)vm\//,
];

/**
 * Stateless film/geometry the Sideshow is allowed to share. These are
 * pure functions over their arguments — importing one cannot change how
 * the faithful engine behaves.
 */
const ALLOWED_PLAY_MODULES = new Set(["facing", "occlude"]);

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full));
      continue;
    }
    if (entry.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Every `from "…"` specifier in a file, static and dynamic alike. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      specs.push(m[1]!);
    }
  }
  return specs;
}

function posix(path: string): string {
  return path.split("\\").join("/");
}

describe("the Sideshow wall", () => {
  const sideshowFiles = tsFilesUnder(SIDESHOW);

  it("has files to check", () => {
    expect(sideshowFiles.length).toBeGreaterThan(3);
  });

  it("never imports the faithful engine", () => {
    const offenders: string[] = [];
    for (const file of sideshowFiles) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith(".")) {
          continue;
        }
        const target = posix(relative(ROOT, resolve(file, "..", spec)));
        if (FORBIDDEN.some((re) => re.test(target))) {
          offenders.push(`${posix(relative(ROOT, file))} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("only borrows the two stateless modules from src/play", () => {
    const offenders: string[] = [];
    for (const file of sideshowFiles) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith(".")) {
          continue;
        }
        const target = posix(relative(ROOT, resolve(file, "..", spec)));
        const match = /^src\/play\/([^/]+?)(?:\.ts)?$/.exec(target);
        if (match && !ALLOWED_PLAY_MODULES.has(match[1]!)) {
          offenders.push(`${posix(relative(ROOT, file))} → ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("is never imported by the engine it sits beside", () => {
    const offenders: string[] = [];
    for (const dir of ["play", "vm", "world", "core", "reimagined"]) {
      const full = resolve(ROOT, "src", dir);
      for (const file of tsFilesUnder(full)) {
        for (const spec of importsOf(file)) {
          if (spec.includes("sideshow")) {
            offenders.push(`${posix(relative(ROOT, file))} → ${spec}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
