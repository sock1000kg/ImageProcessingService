import { describe, expect, it } from "vitest";
import { assertImageContents } from "../../src/media-types";
import { PNG_BYTES } from "../helpers/image-bytes";

function upload(name: string, mimetype: string, buffer: Buffer): Express.Multer.File {
  return { originalname: name, mimetype, buffer, size: buffer.length } as Express.Multer.File;
}

describe("assertImageContents", () => {
  it("accepts a file whose content is an allowed image", async () => {
    await expect(assertImageContents([upload("a.png", "image/png", PNG_BYTES)])).resolves.toBeUndefined();
  });

  it("rejects a file that only claims to be an image", async () => {
    const fake = upload("photo.jpg", "image/jpeg", Buffer.from("%PDF-1.7 not an image"));

    await expect(assertImageContents([fake])).rejects.toMatchObject({ status: 400, code: "INVALID_MEDIA_TYPE" });
  });

  it("names the offending file with the given label", async () => {
    const fake = upload("face.png", "image/png", Buffer.from("plain text"));

    await expect(assertImageContents([fake], "Face file")).rejects.toThrow(/Face file face\.png/);
  });
});
