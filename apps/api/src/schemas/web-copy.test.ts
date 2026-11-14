import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The API and the web app are standalone (no shared package), so the web
 * app has its own copy of these schemas in apps/web/src/schemas. This file
 * is the source; the web copy must be identical, or the website could
 * misread what the API sends. After changing a schema here, copy it:
 *
 *   cp apps/api/src/schemas/<file>.ts apps/web/src/schemas/
 *
 * Skipped when the web app is not next to the API (e.g. an API-only deploy).
 */
const here = dirname(fileURLToPath(import.meta.url));
const webDir = join(here, "../../../web/src/schemas");
const normalise = (text: string) => text.replace(/\r\n/g, "\n");
const sources = readdirSync(here).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

describe.skipIf(!existsSync(webDir))("web copy of the schemas", () => {
  it("has exactly the same files", () => {
    const copies = readdirSync(webDir).filter((name) => name.endsWith(".ts"));
    expect(copies.sort()).toEqual([...sources].sort());
  });

  it.each(sources)("%s is identical", (name) => {
    expect(normalise(readFileSync(join(webDir, name), "utf8"))).toBe(normalise(readFileSync(join(here, name), "utf8")));
  });
});
