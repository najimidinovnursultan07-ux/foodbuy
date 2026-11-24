import sharp from 'sharp';
import { staffError } from '../common/api-error';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif', 'heif', 'tiff']);

async function open(buf: Buffer) {
  try {
    const img = sharp(buf, { failOn: 'error', limitInputPixels: 50_000_000 });
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED.has(meta.format)) throw new Error('format');
    return img.rotate(); // учитываем EXIF-ориентацию с телефона
  } catch {
    throw staffError(400, 'INVALID_IMAGE');
  }
}

/** Фото блюда: 960×720 для карточки и 176×176 для списка, WebP. */
export async function processDishPhoto(buf: Buffer): Promise<{ full: Buffer; thumb: Buffer }> {
  const img = await open(buf);
  const [full, thumb] = await Promise.all([
    img.clone().resize(960, 720, { fit: 'cover', position: 'attention' }).webp({ quality: 78 }).toBuffer(),
    img.clone().resize(176, 176, { fit: 'cover', position: 'attention' }).webp({ quality: 70 }).toBuffer(),
  ]);
  return { full, thumb };
}

/** Логотип: до 256×256 без обрезки, WebP. */
export async function processLogo(buf: Buffer): Promise<Buffer> {
  const img = await open(buf);
  return img.resize(256, 256, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}
