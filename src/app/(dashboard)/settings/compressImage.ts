import imageCompression from "browser-image-compression";

// Resizes/re-encodes a user-picked photo to a small JPEG data URL before it
// ever reaches the server — a phone photo can be several MB, but a profile
// picture only ever renders at a few dozen pixels, so there's no reason to
// store (or re-transmit) the original resolution.
export async function compressImage(file: File, maxDimension = 320, maxSizeMB = 0.3): Promise<string> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: maxDimension,
    maxSizeMB,
    fileType: "image/jpeg",
    useWebWorker: true,
  });
  return imageCompression.getDataUrlFromFile(compressed);
}
