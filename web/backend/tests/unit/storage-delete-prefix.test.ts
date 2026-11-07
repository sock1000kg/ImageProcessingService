/**
 * deletePrefix must report objects a bulk delete could not remove, because S3 returns those
 * failures in the response without throwing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { storage, UPLOADS_BUCKET } from "../../src/storage";

function stubS3(deleteResponse: Record<string, unknown>) {
  return vi.spyOn(S3Client.prototype, "send").mockImplementation((async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      return { Contents: [{ Key: "batch-1/input.jpg" }], IsTruncated: false };
    }
    if (command instanceof DeleteObjectsCommand) {
      return deleteResponse;
    }
    throw new Error("Unexpected S3 command");
  }) as never);
}

describe("storage.deletePrefix", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects with the details when the bulk delete reports failures", async () => {
    stubS3({ Errors: [{ Key: "batch-1/input.jpg", Code: "AccessDenied" }] });

    const failure = await storage.deletePrefix(UPLOADS_BUCKET, "batch-1/").catch((error: Error) => error);

    expect(failure).toBeInstanceOf(Error);
    const { message } = failure as Error;
    for (const part of [UPLOADS_BUCKET, "batch-1/", "1", "batch-1/input.jpg", "AccessDenied"]) {
      expect(message).toContain(part);
    }
  });

  it("resolves when the bulk delete reports no failures", async () => {
    const send = stubS3({});

    await expect(storage.deletePrefix(UPLOADS_BUCKET, "batch-1/")).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });
});
