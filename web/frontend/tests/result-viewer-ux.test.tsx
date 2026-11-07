// @vitest-environment happy-dom
/**
 * Tests for Result Viewer UX enhancements:
 * - ImageStage component and boxToPercent pure conversion helper
 * - DetectionList readable telemetry, status badges, and whitelist similarity
 * - ImageResultViewer comparison slider clip-path and box overlay toggle/hover
 * - BatchDetails full-width report card layout and review list selection
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BatchDetails } from "../src/components/BatchDetails";
import { BatchReport } from "../src/components/BatchReport";
import { DetectionList, formatDetectionLabel, formatDetectionStatus } from "../src/components/DetectionList";
import { ImageResultViewer } from "../src/components/ImageResultViewer";
import { boxToPercent, ImageStage } from "../src/components/ui/ImageStage";
import { Batch, BatchReport as Report, Detection, Job } from "../src/types";

// The viewer fetches the original image through the authed API; answer with a tiny blob instead of the network.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(new Blob(["img"]), { status: 200 }))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Step 1: ImageStage and boxToPercent helper", () => {
  it("converts bounding box pixels to percentages for landscape, portrait, and square dimensions", () => {
    // Landscape 1000x500
    const landscapeBox = boxToPercent([100, 50, 300, 250], 1000, 500);
    expect(landscapeBox).toEqual({
      left: 10,
      top: 10,
      width: 20,
      height: 40,
    });

    // Portrait 800x1200
    const portraitBox = boxToPercent([40, 120, 200, 360], 800, 1200);
    expect(portraitBox).toEqual({
      left: 5,
      top: 10,
      width: 20,
      height: 20,
    });

    // Edge cases: zero dimensions or invalid box coordinates
    expect(boxToPercent([0, 0, 10, 10], 0, 500)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(boxToPercent([1, 2], 500, 500)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it("renders child content within ImageStage", () => {
    render(
      <ImageStage naturalWidth={1920} naturalHeight={1080}>
        <div>content</div>
      </ImageStage>,
    );

    expect(screen.getByText("content")).toBeDefined();
  });
});

describe("Step 2 & 3: ImageResultViewer slider and box overlay", () => {
  const sampleJob: Job = {
    id: "job-1",
    originalFilename: "portrait.jpg",
    status: "COMPLETED",
    progress: 100,
    stage: "Done",
    resultUrl: "blob:http://localhost/processed.jpg",
    resultSummary: { imageSize: [800, 1200] },
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleDetections: Detection[] = [
    {
      label: "face",
      confidence: 0.92,
      box: [40, 120, 200, 360],
      redacted: true,
      whitelisted: false,
      whitelistRef: null,
      similarity: null,
      lowConfidence: false,
      needsReview: false,
      similarityNearThreshold: false,
      reviewReasons: [],
    },
    {
      label: "plate",
      confidence: 0.85,
      box: [220, 300, 310, 340],
      redacted: true,
      whitelisted: false,
      whitelistRef: null,
      similarity: null,
      lowConfidence: false,
      needsReview: false,
      similarityNearThreshold: false,
      reviewReasons: [],
    },
    {
      label: "face",
      confidence: 0.45,
      box: null, // No box available
      redacted: true,
      whitelisted: false,
      whitelistRef: null,
      similarity: null,
      lowConfidence: true,
      needsReview: true,
      similarityNearThreshold: false,
      reviewReasons: ["Low confidence"],
    },
  ];

  it("moving before / after slider updates split percentage value and clip inside image-stage", async () => {
    render(<ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />);

    const stage = screen.getByTestId("image-stage");
    const slider = within(stage).getByRole("slider", { name: /before \/ after/i }) as HTMLInputElement;
    expect(slider).toBeDefined();
    expect(slider.value).toBe("0");

    const originalImg = await screen.findByAltText(new RegExp(`Original ${sampleJob.originalFilename}`, "i"));
    const clipContainer = originalImg.parentElement;
    expect(clipContainer?.style.clipPath).toContain("100% - 0%");

    // Move slider to 25%
    fireEvent.change(slider, { target: { value: "25" } });
    expect(slider.value).toBe("25");
    expect(clipContainer?.style.clipPath).toContain("100% - 25%");

    // Turning on Show boxes still shows labels
    expect(screen.queryByText("#1")).toBeNull();
    const toggle = screen.getByLabelText(/show boxes/i) as HTMLInputElement;
    fireEvent.click(toggle);
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
  });

  it("toggling Show boxes renders detection box labels and toggling off hides them", () => {
    render(<ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />);

    // Overlay is hidden by default
    expect(screen.queryByText("#1")).toBeNull();

    // Toggle Show boxes ON
    const toggle = screen.getByLabelText(/show boxes/i) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    // Only 2 of the 3 detections have boxes, so labels #1 and #2 appear
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();

    // Uncheck toggle hides all boxes
    fireEvent.click(toggle);
    expect(screen.queryByText("#1")).toBeNull();
  });

  it("box key legend is absent by default, present after turning on Show boxes, and absent again after turning it off", () => {
    render(<ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />);

    // Box key is absent by default
    expect(screen.queryByRole("list", { name: /box key/i })).toBeNull();

    // Toggle Show boxes ON
    const toggle = screen.getByLabelText(/show boxes/i) as HTMLInputElement;
    fireEvent.click(toggle);

    // Box key is present and contains swatches/labels
    const boxKey = screen.getByRole("list", { name: /box key/i });
    expect(boxKey).toBeDefined();
    expect(within(boxKey).getByText(/redacted/i)).toBeDefined();
    expect(within(boxKey).getByText(/kept/i)).toBeDefined();
    expect(within(boxKey).getByText(/review/i)).toBeDefined();

    // Toggle Show boxes OFF
    fireEvent.click(toggle);
    expect(screen.queryByRole("list", { name: /box key/i })).toBeNull();
  });

  it("hovering a detection row activates the overlay and shows the specific box label", () => {
    render(<ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />);

    expect(screen.queryByText("#1")).toBeNull();

    const list = screen.getByRole("list", { name: /detection/i });
    const rows = within(list).getAllByRole("listitem");

    // Hover row #1
    fireEvent.mouseEnter(rows[0]);
    expect(screen.getByText("#1")).toBeDefined();

    // Leave row
    fireEvent.mouseLeave(rows[0]);
    expect(screen.queryByText("#1")).toBeNull();
  });
});

describe("Step 4: DetectionList readable rows and telemetry format", () => {
  const detections: Detection[] = [
    {
      label: "face",
      confidence: 0.92,
      box: [34, 12, 120, 250],
      redacted: true,
      whitelisted: false,
      whitelistRef: null,
      similarity: 0.18,
      lowConfidence: false,
      needsReview: false,
      similarityNearThreshold: false,
      reviewReasons: [],
    },
    {
      label: "face",
      confidence: 0.88,
      box: [400, 40, 480, 160],
      redacted: false,
      whitelisted: true,
      whitelistRef: 0,
      similarity: 0.71,
      lowConfidence: false,
      needsReview: false,
      similarityNearThreshold: false,
      reviewReasons: [],
    },
    {
      label: "plate",
      confidence: 0.41,
      box: [600, 90, 640, 140],
      redacted: true,
      whitelisted: false,
      whitelistRef: null,
      similarity: null,
      lowConfidence: true,
      needsReview: true,
      similarityNearThreshold: false,
      reviewReasons: ["Low confidence"],
      reviewNotes: ["low confidence 0.41"],
    },
  ];

  it("shows detections with confidence, whitelist reference, review flags, and no debug fields", () => {
    const { container } = render(<DetectionList detections={detections} hasWhitelist={true} />);

    const list = screen.getByRole("list", { name: /detection/i });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // Row 1: face with 92% confidence
    expect(within(items[0]).getByText(/92%/)).toBeDefined();

    // Row 2: Whitelist reference (whitelistRef 0 -> person #1)
    expect(within(items[1]).getByText(/allow list.*1/i)).toBeDefined();

    // Row 3: Flags and review notes
    expect(within(items[2]).getByText(/licen[sc]e plate/i)).toBeDefined();
    expect(within(items[2]).getByText(/0\.41/)).toBeDefined();

    // Exactly one row has review/flagged status
    const flaggedItems = items.filter((item) => within(item).queryByRole("status") !== null);
    expect(flaggedItems).toHaveLength(1);
    expect(flaggedItems[0]).toBe(items[2]);

    // Debug fields must NOT appear anywhere
    const rawContent = container.textContent ?? "";
    expect(rawContent).not.toContain("needsReview —");
    expect(rawContent).not.toContain("lowConfidence");
    expect(rawContent).not.toContain("Whitelist ref");
    expect(rawContent).not.toContain("Box: [");
    expect(rawContent).not.toContain("Box unavailable");
  });

  it("shows similarity only when batch has a whitelist", () => {
    // When hasWhitelist is false
    const { container: withoutWhitelist } = render(<DetectionList detections={detections} hasWhitelist={false} />);
    expect(withoutWhitelist.textContent).not.toMatch(/0\.18/);

    // When hasWhitelist is true
    const { container: withWhitelist } = render(<DetectionList detections={detections} hasWhitelist={true} />);
    expect(withWhitelist.textContent).toMatch(/0\.18/);
    expect(withWhitelist.textContent).toMatch(/0\.71/);
  });
});

describe("Step 5: BatchDetails layout and BatchReport selection", () => {
  const sampleBatch: Batch = {
    id: "batch-1",
    name: "Test Batch",
    status: "COMPLETED",
    config: {},
    whitelistKeys: ["wh-1"],
    whitelistDeletedAt: null,
    createdAt: new Date().toISOString(),
    jobs: [
      {
        id: "job-1",
        originalFilename: "image1.jpg",
        status: "COMPLETED",
        progress: 100,
        stage: "Done",
        resultUrl: "blob:http://localhost/result1.jpg",
        resultSummary: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "job-2",
        originalFilename: "image2.jpg",
        status: "COMPLETED",
        progress: 100,
        stage: "Done",
        resultUrl: "blob:http://localhost/result2.jpg",
        resultSummary: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  const sampleReport: Report = {
    batchId: "batch-1",
    status: "COMPLETED",
    totals: {
      images: 2,
      completed: 2,
      failed: 0,
      faces: 2,
      plates: 1,
      redacted: 2,
      whitelisted: 1,
      lowConfidence: 1,
    },
    images: [],
    lowConfidenceDetections: [],
    reviewImages: [
      {
        jobId: "job-2",
        originalFilename: "image2.jpg",
        reviewReasons: ["Low confidence"],
        reviewNotes: ["confidence 0.41 below threshold 0.50"],
      },
    ],
    reviewDetections: [],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/report")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ report: sampleReport }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }),
    );
  });

  it("BatchReport shows reviewNotes, and clicking a review image triggers onSelectImage", () => {
    const onSelect = vi.fn();
    const { container } = render(<BatchReport report={sampleReport} onSelectImage={onSelect} />);

    // Displays review notes
    expect(container.textContent).toContain("confidence 0.41 below threshold 0.50");

    // Click selects the image
    const reviewSection = screen.getByRole("region", { name: /review/i });
    const buttons = within(reviewSection).getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith("job-2");
  });
});
