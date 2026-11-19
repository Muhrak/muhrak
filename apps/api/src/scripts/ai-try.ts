import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { env } from "../config/env";
import { pool } from "../db/client";
import { listCategories } from "../modules/catalog";
import { aiModelOutputSchema } from "../schemas";
import { createGeminiProvider } from "../modules/ai/providers/gemini";
import { processProductPhoto } from "../modules/upload/photo";

/**
 * Try the AI on local part photos, to check and adjust the prompt
 * (src/modules/ai/prompt.ts). Each photo is cleaned exactly as in
 * production (re-encoded WebP, no metadata) and sent ONCE. Prints the
 * validated answer, the tokens and the cost. Reads the categories from the
 * local database. Nothing is saved, and this
 * spend is NOT counted in the in-app monthly budget.
 *
 * Real paid calls: run only with the developer's OK. On the free tier, use
 * only your own test photos (Google may use free-tier data).
 *
 *   pnpm ai:try --yes photo1.jpg photo2.png
 */

const MAX_PHOTOS = 20;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const files = args.filter((arg) => !arg.startsWith("--"));
  if (!args.includes("--yes") || files.length === 0) {
    console.error("Usage: pnpm ai:try --yes <photo> [photo ...]   (makes one real model call per photo)");
    process.exit(1);
  }
  if (files.length > MAX_PHOTOS) {
    console.error(`At most ${MAX_PHOTOS} photos per run.`);
    process.exit(1);
  }
  if (!env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set in apps/api/.env");
    process.exit(1);
  }

  const provider = createGeminiProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL });
  // The real category list, from the local database.
  const categories = (await listCategories()).map((category) => ({ slug: category.slug, name: category.name }));
  let totalMicroUsd = 0;

  for (const file of files) {
    console.log(`\n=== ${basename(file)}`);
    try {
      const photo = await processProductPhoto(await readFile(file));
      const started = Date.now();
      const result = await provider.identifyPart({ images: [{ bytes: photo.large, mimeType: "image/webp" }], categories });
      const cost =
        Math.ceil((result.usage.inputTokens * env.GEMINI_INPUT_USD_PER_MTOK) / 1_000_000) +
        Math.ceil((result.usage.outputTokens * env.GEMINI_OUTPUT_USD_PER_MTOK) / 1_000_000);
      totalMicroUsd += cost;
      const parsed = aiModelOutputSchema.safeParse(result.output);
      console.log(parsed.success ? JSON.stringify(parsed.data, null, 2) : `INVALID ANSWER: ${parsed.error.message}`);
      console.log(
        `${env.GEMINI_MODEL}: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out tokens, ` +
          `US$${(cost / 1_000_000).toFixed(6)}, ${Date.now() - started} ms`,
      );
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nTotal: US$${(totalMicroUsd / 1_000_000).toFixed(6)} for ${files.length} photo(s)`);
}

void main().finally(() => pool.end());
