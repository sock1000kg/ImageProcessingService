// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../src/api";
import { BatchDetails } from "../src/components/BatchDetails";
import { ImageResultViewer } from "../src/components/ImageResultViewer";
import { boxToPercent, percentToBox, stageCoordsToPixelBox } from "../src/components/ui/ImageStage";
import { Batch, Detection, Job } from "../src/types";

describe("Task 93: 'Sửa ảnh' Redaction Editor (Frontend)", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockCompletedJob: Job = {
    id: "job-1",
    batchId: "batch-1",
    originalFilename: "sample.jpg",
    status: "COMPLETED",
    progress: 100,
    stage: "DONE",
    resultSummary: {
      imageSize: [1000, 1000],
      detections: [
        { label: "face", box: [50, 60, 200, 220], redacted: true, confidence: 0.95 },
        { label: "plate", box: [300, 400, 600, 500], redacted: true, confidence: 0.88 },
        { label: "face", box: [700, 100, 850, 250], redacted: false, confidence: 0.75 },
      ],
    },
    error: null,
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T09:01:00Z",
  };

  const mockDetections: Detection[] = [
    {
      label: "face",
      box: [50, 60, 200, 220],
      redacted: true,
      confidence: 0.95,
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
      box: [300, 400, 600, 500],
      redacted: true,
      confidence: 0.88,
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
      box: [700, 100, 850, 250],
      redacted: false,
      confidence: 0.75,
      whitelisted: true,
      whitelistRef: 0,
      similarity: 0.82,
      lowConfidence: false,
      needsReview: false,
      similarityNearThreshold: false,
      reviewReasons: [],
    },
  ];

  beforeEach(() => {
    vi.spyOn(api, "request").mockImplementation(async (url: string) => {
      if (url.includes("/original-url")) {
        return { url: "https://example.com/original.jpg", expiresAt: "2026-11-09T10:00:00Z" };
      }
      if (url.includes("/result-url")) {
        return { url: "https://example.com/result.jpg", expiresAt: "2026-11-09T10:00:00Z" };
      }
      return {};
    });
  });

  describe("1. Coordinate conversion pure helper (round trip with boxToPercent)", () => {
    it("round trips perfectly with boxToPercent across standard and arbitrary dimensions", () => {
      const W = 1920;
      const H = 1080;
      const box: [number, number, number, number] = [120, 80, 450, 360];

      const percent = boxToPercent(box, W, H);
      const reconstructed = percentToBox(percent, W, H);

      expect(reconstructed).toEqual(box);
    });

    it("round trips with various aspect ratios and bounding box coordinates", () => {
      const naturalWidth = 800;
      const naturalHeight = 600;
      const boxes: Array<[number, number, number, number]> = [
        [0, 0, 100, 100],
        [40, 50, 320, 450],
        [150, 200, 750, 580],
        [0, 0, naturalWidth, naturalHeight],
      ];

      for (const b of boxes) {
        const percent = boxToPercent(b, naturalWidth, naturalHeight);
        expect(percentToBox(percent, naturalWidth, naturalHeight)).toEqual(b);
      }
    });

    it("converts stage coordinates to original-image pixel bounding boxes correctly", () => {
      const stageSize = { width: 400, height: 300 };
      const naturalSize = { width: 1600, height: 1200 };

      // Pointer drag from stage point (10, 20) to (100, 150) -> scaled by 4x
      const pixelBox = stageCoordsToPixelBox({ x: 10, y: 20 }, { x: 100, y: 150 }, stageSize, naturalSize);
      expect(pixelBox).toEqual([40, 80, 400, 600]);
    });
  });

  describe("2. Edit button visibility", () => {
    it("edit button is not offered for a FAILED or running job", () => {
      const failedJob: Job = { ...mockCompletedJob, id: "job-failed", status: "FAILED" };
      const { rerender } = render(
        <ImageResultViewer job={failedJob} detections={mockDetections} reviewReasons={[]} onRetry={vi.fn()} />,
      );

      expect(screen.queryByRole("button", { name: /edit redaction/i })).toBeNull();

      const runningJob: Job = { ...mockCompletedJob, id: "job-running", status: "PROCESSING", progress: 50 };
      rerender(<ImageResultViewer job={runningJob} detections={mockDetections} reviewReasons={[]} onRetry={vi.fn()} />);

      expect(screen.queryByRole("button", { name: /edit redaction/i })).toBeNull();
    });

    it("edit button is offered when job.status === 'COMPLETED'", () => {
      render(
        <ImageResultViewer job={mockCompletedJob} detections={mockDetections} reviewReasons={[]} onRetry={vi.fn()} />,
      );

      expect(screen.getByRole("button", { name: /edit redaction/i })).toBeDefined();
    });
  });

  describe("3. Unchecking a box and applying sends redactIndices without that index", () => {
    it("unchecking detection #1 sends redactIndices without index 0", async () => {
      const editSpy = vi.spyOn(api, "editJob").mockResolvedValue({
        job: { ...mockCompletedJob, id: "job-new-1", status: "QUEUED" },
      });
      const onSelectJob = vi.fn();
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          batchConfig={{ style: "blur", strength: 15 }}
          onRetry={vi.fn()}
          onSelectJob={onSelectJob}
          onRefresh={onRefresh}
        />,
      );

      // Open edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Apply starts disabled because no changes have been made yet
      const applyButton = screen.getByRole("button", { name: /apply/i }) as HTMLButtonElement;
      expect(applyButton.disabled).toBe(true);

      // Detection #1 was initially redacted: true, so its checkbox is checked
      const detection1Checkbox = screen.getByRole("checkbox", { name: /redact detection #1/i }) as HTMLInputElement;
      expect(detection1Checkbox.checked).toBe(true);

      // Uncheck detection #1
      fireEvent.click(detection1Checkbox);
      expect(detection1Checkbox.checked).toBe(false);

      // Apply is now enabled
      expect(applyButton.disabled).toBe(false);

      // Click Apply
      fireEvent.click(applyButton);

      await waitFor(() => {
        expect(editSpy).toHaveBeenCalledTimes(1);
      });

      const calledPayload = editSpy.mock.calls[0][1];
      // Index 0 was unchecked; only index 1 remains redacted
      expect(calledPayload.redactIndices).toEqual([1]);
      expect(calledPayload.style).toBe("blur");
      expect(calledPayload.strength).toBe(15);
    });
  });

  describe("4. Drawing a box and removing it", () => {
    it("drawing a box sends addedBoxes in image pixels; removing it before Apply sends none", async () => {
      const editSpy = vi.spyOn(api, "editJob").mockResolvedValue({
        job: { ...mockCompletedJob, id: "job-new-2", status: "QUEUED" },
      });

      const addBoxRef: { current: ((box: [number, number, number, number]) => void) | null } = { current: null };

      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          batchConfig={{ style: "pixelate", strength: 8 }}
          onRetry={vi.fn()}
          addBoxHandlerRef={addBoxRef}
        />,
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Use the coordinate helper to generate an added box
      const naturalSize = { width: 1000, height: 1000 };
      const stageSize = { width: 500, height: 500 };
      const drawnBox = stageCoordsToPixelBox({ x: 25, y: 30 }, { x: 100, y: 120 }, stageSize, naturalSize);
      expect(drawnBox).toEqual([50, 60, 200, 240]);

      // Simulate drawing by calling the component's add path
      expect(addBoxRef.current).toBeTypeOf("function");
      addBoxRef.current!(drawnBox);

      // Verify added box row appears in detection list with a remove button
      const removeButtons = await screen.findAllByRole("button", { name: /remove drawn box 1/i });
      expect(removeButtons.length).toBeGreaterThan(0);

      // Remove the box before applying
      fireEvent.click(removeButtons[0]);
      expect(screen.queryByRole("button", { name: /remove drawn box 1/i })).toBeNull();

      // Apply button should be disabled since there are no changes left
      const applyBtn = screen.getByRole("button", { name: /apply/i }) as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(true);

      // Draw another box and keep it
      const drawnBox2 = stageCoordsToPixelBox({ x: 150, y: 160 }, { x: 300, y: 350 }, stageSize, naturalSize);
      addBoxRef.current!(drawnBox2);
      await waitFor(() => {
        expect(applyBtn.disabled).toBe(false);
      });

      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(editSpy).toHaveBeenCalledTimes(1);
      });

      const payload = editSpy.mock.calls[0][1];
      expect(payload.addedBoxes).toEqual([{ box: drawnBox2 }]);
      expect(payload.style).toBe("pixelate");
      expect(payload.strength).toBe(8);
    });

    it("ignores boxes smaller than a few pixels", () => {
      const addBoxRef: { current: ((box: [number, number, number, number]) => void) | null } = { current: null };

      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          onRetry={vi.fn()}
          addBoxHandlerRef={addBoxRef}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Tiny 2x2 box
      addBoxRef.current!([10, 10, 12, 12]);
      expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
    });

    it("drawing via pointer drag on the stage draw area adds a box in original-image pixels", async () => {
      render(
        <ImageResultViewer job={mockCompletedJob} detections={mockDetections} reviewReasons={[]} onRetry={vi.fn()} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      const drawArea = await screen.findByTestId("stage-draw-area");
      fireEvent.pointerDown(drawArea, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(drawArea, { clientX: 300, clientY: 400 });
      fireEvent.pointerUp(drawArea, { clientX: 300, clientY: 400 });

      expect((await screen.findAllByRole("button", { name: /remove drawn box 1/i })).length).toBeGreaterThan(0);
    });
  });

  describe("5. Selection after Apply", () => {
    it("after Apply the new job becomes the selected one", async () => {
      const newJobId = "job-replacement-99";
      vi.spyOn(api, "editJob").mockResolvedValue({
        job: { ...mockCompletedJob, id: newJobId, status: "QUEUED" },
      });

      const onSelectJob = vi.fn();
      const onRefresh = vi.fn().mockResolvedValue(undefined);

      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          onRetry={vi.fn()}
          onSelectJob={onSelectJob}
          onRefresh={onRefresh}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Toggle a detection
      fireEvent.click(screen.getByRole("checkbox", { name: /redact detection #1/i }));

      // Click Apply
      fireEvent.click(screen.getByRole("button", { name: /apply/i }));

      await waitFor(() => {
        expect(onSelectJob).toHaveBeenCalledWith(newJobId);
        expect(onRefresh).toHaveBeenCalled();
      });
    });

    it("integrated with BatchDetails: selecting new job updates selection and refreshes batch", async () => {
      const newJobId = "new-replacement-job-id";
      const replacementJob: Job = {
        ...mockCompletedJob,
        id: newJobId,
        status: "QUEUED",
        progress: 0,
        stage: "WAITING",
        resultSummary: null,
      };

      vi.spyOn(api, "editJob").mockResolvedValue({
        job: replacementJob,
      });

      const mockBatch: Batch = {
        id: "batch-1",
        name: "Test Batch",
        status: "COMPLETED",
        config: { style: "blur", strength: 15 },
        whitelistKeys: [],
        whitelistDeletedAt: null,
        createdAt: "2026-11-09T09:00:00Z",
        jobs: [mockCompletedJob],
      };

      const onRefresh = vi.fn().mockResolvedValue(undefined);
      const onMessage = vi.fn();

      render(
        <MemoryRouter>
          <BatchDetails batch={mockBatch} onRefresh={onRefresh} onDelete={vi.fn()} onMessage={onMessage} />
        </MemoryRouter>,
      );

      // Enter edit mode
      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Change redaction style to pixelate
      const styleSelect = screen.getByLabelText(/redaction style/i);
      fireEvent.change(styleSelect, { target: { value: "pixelate" } });

      // Click Apply
      const applyBtn = screen.getByRole("button", { name: /apply/i });
      fireEvent.click(applyBtn);

      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalled();
      });
    });
  });

  describe("6. API errors show through page's error message path", () => {
    it("displays error message when editJob fails with API error", async () => {
      vi.spyOn(api, "editJob").mockRejectedValue(
        new api.ApiError("Job is not currently editable", { status: 409, code: "JOB_NOT_EDITABLE" }),
      );

      const onError = vi.fn();

      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          onRetry={vi.fn()}
          onError={onError}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));
      fireEvent.click(screen.getByRole("checkbox", { name: /redact detection #1/i }));

      fireEvent.click(screen.getByRole("button", { name: /apply/i }));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith("Job is not currently editable");
      });
    });
  });

  describe("7. Discarding edits with Cancel", () => {
    it("Cancel discards all box and style changes and exits edit mode", () => {
      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          batchConfig={{ style: "blur", strength: 15 }}
          onRetry={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit redaction/i }));

      // Uncheck detection #1
      fireEvent.click(screen.getByRole("checkbox", { name: /redact detection #1/i }));

      // Change style
      const styleSelect = screen.getByLabelText(/redaction style/i);
      fireEvent.change(styleSelect, { target: { value: "pixelate" } });

      // Click Cancel
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      // Edit controls are gone, Edit redaction button reappears
      expect(screen.getByRole("button", { name: /edit redaction/i })).toBeDefined();
      expect(screen.queryByRole("button", { name: /apply/i })).toBeNull();
    });
  });

  describe("8. Live preview in edit mode (Task 94)", () => {
    it("changing the strength or unchecking a box does not break the viewer and the preview is present", async () => {
      render(
        <ImageResultViewer
          job={mockCompletedJob}
          detections={mockDetections}
          reviewReasons={[]}
          batchConfig={{ style: "blur", strength: 15 }}
          onRetry={vi.fn()}
        />,
      );

      // Edit redaction button is a primary button
      const editButton = screen.getByRole("button", { name: /edit redaction/i });
      expect(editButton.classList.contains("primary-button")).toBe(true);

      // Enter edit mode
      fireEvent.click(editButton);

      // Live preview canvas is present once presigned URLs resolve
      const previewCanvas = await screen.findByLabelText(/live redaction preview/i);
      expect(previewCanvas).toBeDefined();

      // Change strength
      const strengthSlider = screen.getByLabelText(/strength/i, { selector: "input" });
      fireEvent.change(strengthSlider, { target: { value: "30" } });

      // Uncheck detection #1
      const detection1Checkbox = screen.getByRole("checkbox", { name: /redact detection #1/i });
      fireEvent.click(detection1Checkbox);

      // Viewer is intact and live preview canvas remains present
      expect(screen.getByLabelText(/live redaction preview/i)).toBe(previewCanvas);
      expect(screen.getByText(/approximate preview/i)).toBeDefined();

      // Apply button is enabled
      const applyBtn = screen.getByRole("button", { name: /apply/i }) as HTMLButtonElement;
      expect(applyBtn.disabled).toBe(false);
    });
  });
});
