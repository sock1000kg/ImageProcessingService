// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/api";
import { BatchCreateForm } from "../src/components/BatchCreateForm";
import { MemoryRouter } from "react-router-dom";
import { FileDropzone } from "../src/components/FileDropzone";
import { DEFAULT_FORM_CONFIG, FormConfig, RedactionConfigForm } from "../src/components/RedactionConfigForm";
import { getFileRejectionReason, selectFolderFiles, formatFolderSummary } from "../src/components/file-selection";
import { setUploadLimits } from "../src/upload-limits";

const MB = 1024 * 1024;
const fileOf = (name: string, type: string, size: number) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("upload size limit", () => {
  afterEach(() => {
    cleanup();
    setUploadLimits(null);
    vi.restoreAllMocks();
  });

  it("names the real limit in a rejection and in the folder summary once it is known", () => {
    setUploadLimits({ imageUploadMaxBytes: 50 * MB, videoUploadMaxBytes: 200 * MB, batchMaxFiles: 1000 });
    const big = fileOf("giant.jpg", "image/jpeg", 63 * MB);

    expect(getFileRejectionReason(big)).toMatch(/63 MB.*50 MB file size limit/);

    const result = selectFolderFiles([big, fileOf("ok.jpg", "image/jpeg", MB)]);
    expect(result.images).toHaveLength(1);
    expect(formatFolderSummary(result)).toMatch(/1 over the file size limit \(50 MB for photos, 200 MB for videos\)/);
  });

  it("lets a video be larger than a photo", () => {
    setUploadLimits({ imageUploadMaxBytes: 50 * MB, videoUploadMaxBytes: 200 * MB, batchMaxFiles: 1000 });

    const bigVideo = fileOf("clip.mp4", "video/mp4", 150 * MB);
    const bigPhoto = fileOf("photo.jpg", "image/jpeg", 150 * MB);

    expect(selectFolderFiles([bigVideo]).images).toHaveLength(1);
    expect(selectFolderFiles([bigPhoto]).images).toHaveLength(0);
    expect(getFileRejectionReason(bigPhoto)).toMatch(/50 MB file size limit/);
  });

  it("does not size-check in the browser while the limit is unknown", () => {
    const big = fileOf("giant.jpg", "image/jpeg", 63 * MB);
    expect(selectFolderFiles([big]).images).toHaveLength(1);
  });

  it("shows the limit in the dropzone hint after loading it from the backend", async () => {
    vi.spyOn(api, "getLimits").mockResolvedValue({
      imageUploadMaxBytes: 50 * MB,
      videoUploadMaxBytes: 200 * MB,
      batchMaxFiles: 1000,
    });
    render(<FileDropzone files={[]} errors={{}} onFiles={() => {}} />);
    await waitFor(() => expect(screen.getByText(/photos up to 50 MB, videos up to 200 MB/i)).toBeTruthy());
  });
});

describe("detection mode", () => {
  afterEach(cleanup);

  it("fills the mode's confidence thresholds into the config so they are what gets sent", () => {
    let latest: FormConfig = DEFAULT_FORM_CONFIG;
    function Harness() {
      const [config, setConfig] = useState<FormConfig>(DEFAULT_FORM_CONFIG);
      latest = config;
      return <RedactionConfigForm config={config} setConfig={setConfig} />;
    }
    render(<Harness />);

    fireEvent.change(screen.getByRole("combobox", { name: /detection mode/i }), { target: { value: "max_privacy" } });

    expect(latest.detectionMode).toBe("max_privacy");
    expect(latest.faceConfidenceThreshold).toBe(0.06);
    expect(latest.plateConfidenceThreshold).toBe(0.05);
  });
});

describe("files per batch limit", () => {
  afterEach(() => {
    cleanup();
    setUploadLimits(null);
    vi.restoreAllMocks();
  });

  it("keeps what fits in the batch and lists the rest as rejected with the limit", async () => {
    vi.spyOn(api, "getLimits").mockResolvedValue({
      imageUploadMaxBytes: 50 * MB,
      videoUploadMaxBytes: 200 * MB,
      batchMaxFiles: 2,
    });
    setUploadLimits({ imageUploadMaxBytes: 50 * MB, videoUploadMaxBytes: 200 * MB, batchMaxFiles: 2 });
    const { container } = render(
      <MemoryRouter>
        <BatchCreateForm busy={false} error="" onSubmit={async () => undefined} />
      </MemoryRouter>,
    );
    const input = container.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement;
    const files = ["a.jpg", "b.jpg", "c.jpg"].map((name) => fileOf(name, "image/jpeg", 1024));

    fireEvent.change(input, { target: { files } });

    await waitFor(() => expect(screen.getAllByText(/2 images selected/i).length).toBeGreaterThan(0));
    expect(screen.getByText(/c\.jpg/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/2 file batch limit/);
  });
});
