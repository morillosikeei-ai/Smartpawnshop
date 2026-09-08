/**
 * Client-side photo quality check for item photos.
 *
 * Two cheap measures over a downscaled grayscale copy of the image: mean
 * brightness, and the variance of a Laplacian response as a stand-in for
 * sharpness. Both run on the canvas API alone, so there is no library and no
 * upload before the staff sees the verdict.
 *
 * The result is advice. A photo that fails still attaches, because a walk-in
 * transaction must not stall on a retake.
 */

/** The longest edge of the copy the measures run over. */
const ANALYSIS_MAX_EDGE = 256;

/** Mean luma below this reads as underexposed. */
export const MIN_BRIGHTNESS = 0.22;

/** Mean luma above this reads as blown out. */
export const MAX_BRIGHTNESS = 0.88;

/**
 * Laplacian variance below this reads as blurry.
 *
 * The value is tied to ANALYSIS_MAX_EDGE: the same photo measured at another
 * size scores differently, so change both together.
 */
export const MIN_SHARPNESS = 90;

export type PhotoQuality = {
  /** Mean luma, 0 (black) to 1 (white). */
  brightness: number;
  /** Laplacian variance. Higher is sharper. */
  sharpness: number;
  tooDark: boolean;
  tooBright: boolean;
  blurry: boolean;
  /** True when the photo passes every check. */
  ok: boolean;
  /** What to show the staff. Empty when ok. */
  warning: string;
};

/**
 * Mean brightness and Laplacian variance for one grayscale plane.
 *
 * Kept separate from the canvas work so the thresholds can be measured against
 * known pixels.
 */
export function scoreGrayscale(gray: Uint8ClampedArray | Uint8Array, width: number, height: number): { brightness: number; sharpness: number } {
  if (width < 3 || height < 3) return { brightness: 0, sharpness: 0 };

  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const brightness = sum / gray.length / 255;

  // 4-neighbour Laplacian over the interior pixels. Its variance is high when
  // edges are crisp and collapses toward zero as the image softens.
  let responseSum = 0;
  let responseSquareSum = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const response = 4 * gray[index] - gray[index - 1] - gray[index + 1] - gray[index - width] - gray[index + width];
      responseSum += response;
      responseSquareSum += response * response;
      count++;
    }
  }

  const mean = responseSum / count;
  const sharpness = responseSquareSum / count - mean * mean;

  return { brightness, sharpness: Math.max(0, sharpness) };
}

/** Turn the two measures into a verdict and the line the staff reads. */
export function judge(brightness: number, sharpness: number): PhotoQuality {
  const tooDark = brightness < MIN_BRIGHTNESS;
  const tooBright = brightness > MAX_BRIGHTNESS;
  const blurry = sharpness < MIN_SHARPNESS;
  const ok = !tooDark && !tooBright && !blurry;

  let warning = '';
  if (tooBright && !blurry) {
    warning = 'This photo looks overexposed — please retake it for a clearer appraisal record.';
  } else if (!ok) {
    warning = 'This photo looks blurry or too dark — please retake it for a clearer appraisal record.';
  }

  return { brightness, sharpness, tooDark, tooBright, blurry, ok, warning };
}

/** Decode the file into an image the canvas can draw. */
async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image could not be decoded.'));
      element.src = objectUrl;
    });

    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(objectUrl) };
  } catch (cause) {
    URL.revokeObjectURL(objectUrl);
    throw cause;
  }
}

/**
 * Measure one uploaded photo.
 *
 * Returns null when the browser cannot decode or read the image back. The
 * caller treats that as "no opinion" and attaches the photo unchallenged: a
 * check that cannot run is not a reason to doubt the photo.
 */
export async function checkPhotoQuality(file: File): Promise<PhotoQuality | null> {
  let image: Awaited<ReturnType<typeof loadImage>> | null = null;

  try {
    image = await loadImage(file);
    if (!image.width || !image.height) return null;

    const scale = Math.min(1, ANALYSIS_MAX_EDGE / Math.max(image.width, image.height));
    const width = Math.max(3, Math.round(image.width * scale));
    const height = Math.max(3, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image.source, 0, 0, width, height);
    const { data } = context.getImageData(0, 0, width, height);

    // Rec. 601 luma, the same weighting a camera preview uses.
    const gray = new Uint8ClampedArray(width * height);
    for (let pixel = 0; pixel < gray.length; pixel++) {
      const offset = pixel * 4;
      gray[pixel] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    }

    const { brightness, sharpness } = scoreGrayscale(gray, width, height);
    return judge(brightness, sharpness);
  } catch {
    return null;
  } finally {
    image?.release();
  }
}

/** The longest edge an ID photo keeps once it is downscaled for storage. */
const ID_PHOTO_MAX_EDGE = 1600;

/** JPEG quality for the stored ID photo. High enough to read an ID number. */
const ID_PHOTO_QUALITY = 0.82;

/**
 * Read an image file into a JPEG data URL no wider than ID_PHOTO_MAX_EDGE.
 *
 * A phone camera file runs to several megabytes, and the API carries the photo
 * as text inside the JSON body, so the raw file would be sent base64 encoded at
 * a third again its size. Downscaling first keeps the row small and the request
 * fast, and the ID stays legible.
 *
 * Falls back to the untouched file when the browser cannot decode or re-encode
 * it, because a large photo is better than no photo.
 */
export async function readImageAsScaledDataUrl(file: File): Promise<string> {
  const original = () => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });

  let image: Awaited<ReturnType<typeof loadImage>> | null = null;

  try {
    image = await loadImage(file);
    if (!image.width || !image.height) return await original();

    const scale = Math.min(1, ID_PHOTO_MAX_EDGE / Math.max(image.width, image.height));
    if (scale === 1 && file.size <= 1_000_000) return await original();

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return await original();

    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', ID_PHOTO_QUALITY);

    return dataUrl.startsWith('data:image/jpeg') ? dataUrl : await original();
  } catch {
    return original();
  } finally {
    image?.release();
  }
}
