import logger from '../../utils/logger.js';

// Lazy-loaded sharp (only imported when needed)
let sharpModule: any;

async function getSharp(): Promise<any> {
  if (sharpModule) return sharpModule;
  try {
    const mod = await import('sharp');
    sharpModule = mod.default ?? mod;
    return sharpModule;
  } catch (err: any) {
    logger.warn('Failed to load sharp — image processing unavailable', { error: err.message });
    throw new Error('sharp is not installed. Run: pnpm add sharp');
  }
}

/**
 * Convert raw RGBA screen buffer to PNG.
 * nut-js screen.grab() returns raw pixel data — this converts it
 * to a proper PNG for sending to AI or saving.
 */
export async function screenshotToPng(
  rawBuffer: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const sharp = await getSharp();
  return sharp(rawBuffer, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}

/**
 * Resize image to fit within maxWidth/maxHeight while preserving aspect ratio.
 * Used to reduce token cost when sending screenshots to AI vision.
 */
export async function resizeForAI(
  pngBuffer: Buffer,
  maxWidth = 1280,
  maxHeight = 800,
): Promise<Buffer> {
  const sharp = await getSharp();
  const metadata = await sharp(pngBuffer).metadata();
  const w = metadata.width ?? maxWidth;
  const h = metadata.height ?? maxHeight;

  if (w <= maxWidth && h <= maxHeight) return pngBuffer;

  return sharp(pngBuffer)
    .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

/**
 * Convert PNG buffer to base64 for embedding in AI messages.
 */
export function pngToBase64(pngBuffer: Buffer): string {
  return pngBuffer.toString('base64');
}

/**
 * Get image dimensions from a PNG buffer.
 */
export async function getImageDimensions(pngBuffer: Buffer): Promise<{ width: number; height: number }> {
  const sharp = await getSharp();
  const metadata = await sharp(pngBuffer).metadata();
  return { width: metadata.width ?? 0, height: metadata.height ?? 0 };
}
