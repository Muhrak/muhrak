import sharp, { type Metadata, type Sharp } from "sharp";

/**
 * Product photos are public, so the API never publishes the uploaded bytes.
 * Each photo is decoded and re-encoded from its pixels:
 * - all metadata is dropped (EXIF with GPS location, camera serial, XMP,
 *   ICC comments; sharp keeps none unless asked);
 * - the rotation from EXIF is applied first, so the photo still looks right;
 * - the size is capped (1600 px for viewing, 480 px thumbnail), WebP output;
 * - a crafted file cannot survive: only decoded pixels are written back.
 * Decompression bombs are refused before decoding (pixel limit).
 */

const MAX_INPUT_PIXELS = 50_000_000; // ~50 MP: any real phone photo, not a bomb
const LARGE_PX = 1600;
const THUMB_PX = 480;

/** The file is not a usable photo. `userMessage` is safe to show. */
export class PhotoRejected extends Error {
  constructor(
    reason: string,
    public readonly userMessage: string,
  ) {
    super(reason);
    this.name = "PhotoRejected";
  }
}

export async function processProductPhoto(input: Uint8Array): Promise<{ large: Uint8Array; thumb: Uint8Array }> {
  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    meta = await image.metadata();
  } catch (error) {
    throw new PhotoRejected(`decode failed: ${(error as Error).message.slice(0, 120)}`, "This photo could not be read. Please choose another one.");
  }
  if (!meta.width || !meta.height) {
    throw new PhotoRejected("no dimensions", "This photo could not be read. Please choose another one.");
  }
  if (meta.width < 200 || meta.height < 200) {
    throw new PhotoRejected(`too small ${meta.width}x${meta.height}`, "This photo is too small. Use one at least 200 × 200 pixels.");
  }

  try {
    const oriented = image.rotate(); // apply EXIF orientation, then forget it
    const [large, thumb] = await Promise.all([
      oriented
        .clone()
        .resize({ width: LARGE_PX, height: LARGE_PX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer(),
      oriented
        .clone()
        .resize({ width: THUMB_PX, height: THUMB_PX, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer(),
    ]);
    return { large: new Uint8Array(large), thumb: new Uint8Array(thumb) };
  } catch (error) {
    throw new PhotoRejected(`encode failed: ${(error as Error).message.slice(0, 120)}`, "This photo could not be processed. Please choose another one.");
  }
}
