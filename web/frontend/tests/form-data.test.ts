import { describe, expect, it } from "vitest";
import { buildBatchFormData } from "../src/api";

describe("Frontend Batch Form Data Builder", () => {
  it("builds FormData containing files, whitelist, and serialized config", () => {
    const file1 = new File(["test1"], "image1.jpg", { type: "image/jpeg" });
    const file2 = new File(["test2"], "image2.png", { type: "image/png" });
    const faceRef = new File(["ref"], "face-ref.jpg", { type: "image/jpeg" });

    const config = {
      targets: ["face", "plate"],
      style: "pixelate",
      strength: 12,
      quality: "high",
      format: "original",
    };

    const formData = buildBatchFormData([file1, file2], [faceRef], config);

    expect(formData.getAll("files")).toHaveLength(2);
    expect(formData.getAll("whitelist")).toHaveLength(1);
    expect(formData.get("config")).toBe(JSON.stringify(config));
  });

  it("handles empty whitelist correctly", () => {
    const file = new File(["content"], "photo.webp", { type: "image/webp" });
    const config = { style: "blur" };

    const formData = buildBatchFormData([file], [], config);
    expect(formData.getAll("files")).toHaveLength(1);
    expect(formData.getAll("whitelist")).toHaveLength(0);
    expect(formData.get("config")).toBe(JSON.stringify(config));
  });
});
