import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const REPO_ROOT = resolve(import.meta.dirname, "..");

function collectFiles(directory, extensions, accumulator = []) {
  let entries;

  try {
    entries = readdirSync(directory);
  } catch {
    return accumulator;
  }

  for (const entry of entries) {
    const fullPath = join(directory, entry);

    if (statSync(fullPath).isDirectory()) {
      collectFiles(fullPath, extensions, accumulator);
      continue;
    }

    if (extensions.some((extension) => entry.endsWith(extension))) {
      accumulator.push(fullPath);
    }
  }

  return accumulator;
}

const modules = [
  ...collectFiles(join(REPO_ROOT, "src", "lib"), [".mjs"]),
  ...collectFiles(join(REPO_ROOT, "scripts"), [".mjs"]),
].filter((file) => !file.endsWith(".d.mts"));

const sources = collectFiles(join(REPO_ROOT, "src"), [".ts", ".tsx"]);

test("the plain javascript modules of the application are valid javascript", () => {
  // The services of the application are written as .mjs files. The TypeScript
  // compiler never looks at them, so a type annotation in one of these files
  // would only fail at runtime. This test parses every file with node itself.
  assert.ok(modules.length > 0, "no javascript module was found");

  for (const file of modules) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (error) {
      assert.fail(
        `${file} is not valid javascript:\n${error.stderr?.toString() ?? error.message}`
      );
    }
  }
});

test("every phase 3 service that typescript uses has a type declaration", () => {
  // The services of phase 3 are written as .mjs files with a hand written
  // .d.mts file next to them. Without the declaration the typescript build
  // reads the javascript source and loses the contract of the service.
  const phase3Services = [
    "attendance-service",
    "attendance-rules",
    "attendance-reports",
    "attendance-policy",
    "attendance-permissions",
    "attendance-csv",
    "attendance-calculator",
    "attendance-eligibility",
    "leave-service",
    "audit-service",
    "audit-redaction",
    "audit-writer",
    "approval-decision-source",
    "db-transaction",
    "calendar-date",
    "rate-limit",
    "profile-photo-service",
    "http-body",
  ];

  const imported = new Set();

  for (const source of sources) {
    const content = readFileSync(source, "utf8");
    const pattern = /from\s+"@\/lib\/([A-Za-z0-9._-]+)\.mjs"/g;

    for (const match of content.matchAll(pattern)) {
      imported.add(match[1]);
    }
  }

  for (const name of phase3Services) {
    if (!imported.has(name)) {
      continue;
    }

    const declaration = join(REPO_ROOT, "src", "lib", `${name}.d.mts`);

    assert.ok(
      statSync(declaration, { throwIfNoEntry: false }) !== undefined,
      `src/lib/${name}.mjs is used by typescript but has no ${name}.d.mts`
    );
  }
});
