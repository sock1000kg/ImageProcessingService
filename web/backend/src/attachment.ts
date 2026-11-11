/**
 * Content-Disposition attachment headers for downloads.
 */
import contentDisposition from "content-disposition";

/**
 * Sanitizes an attachment filename by stripping path traversal sequences, illegal filename characters,
 * and ASCII / Unicode control characters.
 *
 * Why: Prevents header injection (CRLF), path traversal, and corrupted downloads on proxies
 * or filesystems when names originate from user uploads.
 */
export function sanitizeAttachmentFilename(filename: string, fallback = "download"): string {
  const raw = (filename || "").trim();
  return (
    raw
      .replace(/[/\\?%*:|"<>]/g, "")
      .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
      .replace(/\.\.+/g, "")
      .trim() || fallback
  );
}

/**
 * Builds a Content-Disposition attachment header. The `content-disposition` package does the RFC 6266 work: a quoted
 * ASCII fallback plus a UTF-8 `filename*` so non-ASCII names (e.g. Vietnamese) download correctly. The name is
 * sanitized first because it comes from user uploads.
 */
export function buildAttachmentContentDisposition(filename: string, fallback = "download"): string {
  const clean = sanitizeAttachmentFilename(filename, fallback);
  // The plain filename= stays pure ASCII (the library would keep Latin-1 letters such as "ì"), which proxies and
  // signed URLs handle without surprises; the UTF-8 filename* carries the real name.
  return contentDisposition(clean, { fallback: clean.replace(/[^\x20-\x7e]/g, "_") });
}
