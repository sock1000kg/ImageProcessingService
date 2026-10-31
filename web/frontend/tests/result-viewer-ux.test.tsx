// @vitest-environment happy-dom
/**
 * Tests for Result Viewer UX enhancements:
 * - ImageStage component and boxToPercent pure conversion helper
 * - DetectionList readable telemetry, status badges, and whitelist similarity
 * - ImageResultViewer comparison slider clip-path and box overlay toggle/hover
 * - BatchDetails full-width report card layout and review list selection
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchDetails } from "../src/components/BatchDetails";
import { BatchReport } from "../src/components/BatchReport";
import { DetectionList, formatDetectionLabel, formatDetectionStatus } from "../src/components/DetectionList";
import { ImageResultViewer } from "../src/components/ImageResultViewer";
import { boxToPercent, ImageStage } from "../src/components/ui/ImageStage";
import { Batch, BatchReport as Report, Detection, Job } from "../src/types";

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

  it("renders ImageStage with calculated aspect-ratio style", () => {
    const { container } = render(
      <ImageStage naturalWidth={1920} naturalHeight={1080}>
        <div data-testid="child-layer">content</div>
      </ImageStage>,
    );

    const stage = container.querySelector(".image-stage") as HTMLElement;
    expect(stage).not.toBeNull();
    expect(stage.style.aspectRatio).toBe("1920 / 1080");
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

  it("renders slider layers with clip-path and divider at split percentage", () => {
    const { container } = render(
      <ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />,
    );

    const beforeLayer = container.querySelector(".comparison-before") as HTMLElement;
    const divider = container.querySelector(".comparison-divider") as HTMLElement;

    expect(beforeLayer).not.toBeNull();
    expect(divider).not.toBeNull();

    // Default split is 50%
    expect(beforeLayer.style.clipPath).toBe("inset(0 calc(100% - 50%) 0 0)");
    expect(divider.style.left).toBe("50%");

    // Move slider to 25%
    const slider = screen.getByLabelText(/before \/ after/i) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "25" } });

    expect(beforeLayer.style.clipPath).toBe("inset(0 calc(100% - 25%) 0 0)");
    expect(divider.style.left).toBe("25%");
  });

  it("toggling Show boxes renders exactly one rectangle per detection with a box", () => {
    const { container } = render(
      <ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />,
    );

    // Overlay is hidden by default
    expect(container.querySelector(".detection-overlay")).toBeNull();

    // Toggle Show boxes ON
    const toggle = screen.getByLabelText(/show boxes/i) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);

    // Only 2 of the 3 detections have boxes
    const boxes = container.querySelectorAll(".detection-box");
    expect(boxes).toHaveLength(2);

    expect(boxes[0].textContent).toContain("#1");
    expect(boxes[1].textContent).toContain("#2");

    // Uncheck toggle hides all boxes
    fireEvent.click(toggle);
    expect(container.querySelector(".detection-overlay")).toBeNull();
  });

  it("hovering a detection row activates the overlay and highlights the specific box", () => {
    const { container } = render(
      <ImageResultViewer job={sampleJob} detections={sampleDetections} reviewReasons={[]} onRetry={() => {}} />,
    );

    expect(container.querySelector(".detection-overlay")).toBeNull();

    const rows = container.querySelectorAll(".detection-row");
    expect(rows.length).toBeGreaterThan(0);

    // Hover row #1
    fireEvent.mouseEnter(rows[0]);

    const activeBox = container.querySelector(".detection-box.is-highlighted");
    expect(activeBox).not.toBeNull();
    expect(activeBox?.textContent).toContain("#1");

    // Leave row
    fireEvent.mouseLeave(rows[0]);
    expect(container.querySelector(".detection-overlay")).toBeNull();
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

  it("shows '#1 Face 92% Redacted', 'Kept (whitelist person #1)', exactly one 'Needs review', and no debug fields", () => {
    const { container } = render(<DetectionList detections={detections} hasWhitelist={true} />);

    // Row 1: '#1 Face 92% Redacted'
    expect(container.textContent).toContain("#1 Face 92% Redacted");

    // Row 2: Whitelist reference (whitelistRef 0 -> person #1)
    expect(container.textContent).toContain("Kept (whitelist person #1)");

    // Row 3: Flags and review notes
    expect(container.textContent).toContain("Licence plate");
    expect(container.textContent).toContain("low confidence 0.41");

    // Exactly one 'Needs review' badge across all rows (only row 3 is flagged)
    const reviewBadges = container.querySelectorAll(".review-pill");
    expect(reviewBadges).toHaveLength(1);
    expect(reviewBadges[0].textContent).toBe("Needs review");

    // Debug fields must NOT appear anywhere
    const rawContent = container.textContent ?? "";
    expect(rawContent).not.toContain("needsReview —");
    expect(rawContent).not.toContain("lowConfidence");
    expect(rawContent).not.toContain("Whitelist ref");
    expect(rawContent).not.toContain("Box: [");
    expect(rawContent).not.toContain("Box unavailable");

    // Uses scroll-list class
    expect(container.querySelector(".detection-list.scroll-list")).not.toBeNull();
  });

  it("shows similarity only when batch has a whitelist", () => {
    // When hasWhitelist is false
    const { container: withoutWhitelist } = render(<DetectionList detections={detections} hasWhitelist={false} />);
    expect(withoutWhitelist.textContent).not.toContain("Similarity");

    // When hasWhitelist is true
    const { container: withWhitelist } = render(<DetectionList detections={detections} hasWhitelist={true} />);
    expect(withWhitelist.textContent).toContain("Similarity 0.18");
    expect(withWhitelist.textContent).toContain("Similarity 0.71");
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

  it("verifies report card is outside the right column in BatchDetails layout", () => {
    const { container } = render(
      <BatchDetails batch={sampleBatch} onRefresh={async () => {}} onDelete={() => {}} onMessage={() => {}} />,
    );

    const layout = container.querySelector(".details-layout");
    expect(layout).not.toBeNull();

    // Direct children of details-layout:
    // child 0: left column (image list)
    // child 1: right column (viewer)
    // child 2: report card
    const rightColumn = layout?.querySelector(":scope > div:nth-child(2)");
    expect(rightColumn).not.toBeNull();
    expect(rightColumn?.querySelector(".report-card")).toBeNull();

    const reportCard = layout?.querySelector(":scope > .report-card");
    expect(reportCard).not.toBeNull();
    expect(reportCard?.classList.contains("details-report-card")).toBe(true);
  });

  it("BatchReport uses scroll-list, shows reviewNotes, and clicking a review image triggers onSelectImage", () => {
    const onSelect = vi.fn();
    const { container } = render(<BatchReport report={sampleReport} onSelectImage={onSelect} />);

    // Uses scroll-list
    const reviewList = container.querySelector(".review-report-list.scroll-list");
    expect(reviewList).not.toBeNull();

    // Displays review notes
    expect(container.textContent).toContain("confidence 0.41 below threshold 0.50");

    // Click selects the image
    const item = container.querySelector(".review-report-item.clickable") as HTMLElement;
    expect(item).not.toBeNull();
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("job-2");
  });
});
