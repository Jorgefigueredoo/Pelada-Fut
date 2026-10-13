/**
 * Downscales and re-encodes an image in the browser before upload, so a phone photo
 * (often several MB) never crosses the network or sits in storage at full size.
 *
 * 256px: the largest avatar on screen is 64px (Perfil) and the list shows them at
 * 24px, so this is sharp up to 4x screens. Every list view downloads up to a hundred
 * of them, and that egress counts against the Free plan.
 */
export async function compressImageToWebp(
  file: File,
  { maxSize = 256, quality = 0.85 }: { maxSize?: number; quality?: number } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNSUPPORTED");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("COMPRESS_FAILED"))),
      "image/webp",
      quality,
    );
  });
}
