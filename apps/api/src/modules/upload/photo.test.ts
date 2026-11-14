import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PhotoRejected, processProductPhoto } from "./photo";

/** A real JPEG carrying EXIF with a GPS position, a camera model and a "rotate 90°" orientation. */
async function phonePhoto(width = 3000, height = 2000): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: "PhoneMaker", Model: "Secret Phone 15" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "23/1 35/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "58/1 24/1 0/1" },
    })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("processProductPhoto", () => {
  it("the test photo really carries GPS and camera data", async () => {
    const meta = await sharp(await phonePhoto()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif?.toString("latin1")).toContain("Secret Phone 15");
  });

  it("drops every bit of metadata, applies the rotation, resizes and outputs WebP", async () => {
    const { large, thumb } = await processProductPhoto(await phonePhoto());
    for (const output of [large, thumb]) {
      const meta = await sharp(output).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(Buffer.from(output).toString("latin1")).not.toContain("Secret Phone");
    }
    // Orientation 6 = rotate 90°: the 3000 × 2000 photo becomes portrait, capped at 1600 px.
    const largeMeta = await sharp(large).metadata();
    expect([largeMeta.width, largeMeta.height]).toEqual([1067, 1600]);
    const thumbMeta = await sharp(thumb).metadata();
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBe(480);
  });

  it("does not enlarge a small photo", async () => {
    const { large } = await processProductPhoto(await phonePhoto(800, 600));
    const meta = await sharp(large).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(800);
  });

  it("refuses something that is not an image (e.g. a script renamed .jpg)", async () => {
    await expect(processProductPhoto(new TextEncoder().encode("<script>alert(1)</script>"))).rejects.toBeInstanceOf(PhotoRejected);
  });

  it("refuses a tiny image", async () => {
    await expect(processProductPhoto(await phonePhoto(100, 100))).rejects.toBeInstanceOf(PhotoRejected);
  });

  it("refuses a truncated JPEG", async () => {
    const photo = await phonePhoto();
    await expect(processProductPhoto(photo.slice(0, Math.floor(photo.length / 3)))).rejects.toBeInstanceOf(PhotoRejected);
  });
});
