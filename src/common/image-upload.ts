import { extname } from "path";

// Site photos: only real image formats are stored, under an extension the
// server picks — never the client's file name as-is (no .svg/.html served from
// /uploads with an image-looking name).
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/pjpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/heic-sequence": ".heic",
  "image/heif-sequence": ".heif",
};

const ALLOWED_EXT: Record<string, string> = {
  ".jpg": ".jpg",
  ".jpeg": ".jpg",
  ".png": ".png",
  ".webp": ".webp",
  ".heic": ".heic",
  ".heif": ".heif",
};

// Generic types some phones send for HEIC/JPEG; then the name decides.
const GENERIC_MIME = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

export function safeImageExtension(file: {
  mimetype?: string;
  originalname?: string;
}): string | null {
  const mime = String(file.mimetype || "").toLowerCase();
  const fromName = ALLOWED_EXT[extname(file.originalname || "").toLowerCase()];
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  if (GENERIC_MIME.has(mime) && fromName) return fromName;
  return null;
}

// multer fileFilter: drop anything that is not an allowed image.
export const imageFileFilter = (
  _req: unknown,
  file: { mimetype?: string; originalname?: string },
  cb: (error: Error | null, accept: boolean) => void,
) => cb(null, safeImageExtension(file) !== null);
