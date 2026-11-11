/** A real 1x1 PNG, for tests that upload "an image": the service checks the file's actual content, not its name. */
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHa1gGQAAAABJRU5ErkJggg==",
  "base64",
);
