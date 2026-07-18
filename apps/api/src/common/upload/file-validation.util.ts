import { UnsupportedMediaTypeException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

/**
 * Basic allow-listed MIME type + size cap for direct multipart uploads
 * through the API (Multer memory storage) — stops obviously wrong or
 * oversized files at the point of upload. Deliberately NOT a substitute for
 * real magic-byte re-validation or antivirus scanning (SRS §12's ClamAV
 * hook): a client can still lie about `mimetype` in the multipart header,
 * this only catches accidental/careless mismatches, not a deliberately
 * malicious upload — see KNOWN_GAPS.md.
 */
export function buildUploadOptions(allowedMimeTypes: readonly string[], maxSizeBytes: number): MulterOptions {
  return {
    limits: { fileSize: maxSizeBytes },
    fileFilter: (_req, file, callback) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        callback(
          new UnsupportedMediaTypeException(
            `Unsupported file type "${file.mimetype}". Allowed: ${allowedMimeTypes.join(', ')}`,
          ),
          false,
        );
        return;
      }
      callback(null, true);
    },
  };
}

export const CSV_MIME_TYPES = ['text/csv', 'application/vnd.ms-excel'] as const;
export const MAX_CSV_UPLOAD_BYTES = 5 * 1024 * 1024;
