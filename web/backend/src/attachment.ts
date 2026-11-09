/**
 * Utilities for RFC 5987 / RFC 6266 Content-Disposition attachment header generation.
 */

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
 * Generates an RFC 5987 / RFC 6266 compliant Content-Disposition attachment header with an ASCII
 * fallback filename and UTF-8 encoded filename*.
 *
 * Why: Browser and proxy behavior across domains varies. Including both an ASCII fallback
 * and UTF-8 encoded filename* ensures non-ASCII characters (e.g. Vietnamese) download cleanly
 * without raw non-ASCII header bytes that cause proxy or signature verification failures.
 */
export function buildAttachmentContentDisposition(filename: string, fallback = "download"): string {
  const clean = sanitizeAttachmentFilename(filename, fallback);
  const ascii = clean.replace(/[^\w\s.-]/g, "_").trim() || fallback;
  const utf8 = encodeURIComponent(clean);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
