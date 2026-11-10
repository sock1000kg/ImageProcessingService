// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlateAllowList } from "../src/components/PlateAllowList";
import { VideoResultViewer } from "../src/components/VideoResultViewer";
import { Job } from "../src/types";

vi.mock("../src/hooks/usePresignedUrl", () => ({
  usePresignedUrl: vi.fn((path?: string | null) => ({
    url: path ? "http://localhost/video.mp4" : null,
    loading: false,
    error: false,
  })),
  clearPresignedUrlCache: vi.fn(),
}));

function Harness({ initial = [] as string[] }) {
  const [plates, setPlates] = useState(initial);
  return <PlateAllowList plates={plates} onChange={setPlates} />;
}

describe("PlateAllowList", () => {
  afterEach(cleanup);

  it("adds several plates one by one, stored without spaces, dots and dashes", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: /license plate/i });
    for (const plate of ["30A-123.45", "51g 678.90"]) {
      fireEvent.change(input, { target: { value: plate } });
      fireEvent.click(screen.getByRole("button", { name: /add plate/i }));
    }
    const list = screen.getByRole("list", { name: /allowed license plates/i });
    expect(list.textContent).toContain("30A12345");
    expect(list.textContent).toContain("51G67890");
  });

  it("ignores a plate that is already listed and lets one be removed", () => {
    render(<Harness initial={["30A12345"]} />);
    fireEvent.change(screen.getByRole("textbox", { name: /license plate/i }), { target: { value: "30a-123.45" } });
    expect((screen.getByRole("button", { name: /add plate/i }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /remove 30A12345/i }));
    expect(screen.queryByRole("list", { name: /allowed license plates/i })).toBeNull();
  });
});

describe("VideoResultViewer", () => {
  afterEach(cleanup);
  const job = (overrides: Partial<Job>): Job =>
    ({
      id: "j1",
      batchId: "b",
      originalFilename: "street.mp4",
      status: "PROCESSING",
      progress: 20,
      stage: "Detecting",
      resultSummary: null,
      createdAt: "",
      updatedAt: "",
      ...overrides,
    }) as Job;

  it("shows the progress while processing, inside the shared viewer layout", () => {
    const { container } = render(<VideoResultViewer job={job({})} onRetry={() => {}} />);
    expect(screen.getByText(/20%/)).toBeTruthy();
    expect(container.querySelector(".result-viewer")).not.toBeNull();
  });

  it("shows readable counts for a finished video, not the raw track data", () => {
    const { container } = render(
      <VideoResultViewer
        job={job({
          status: "COMPLETED",
          progress: 100,
          resultSummary: {
            video: { width: 1920, height: 1080, fps: 59.94, durationMs: 18785 },
            counts: { faceTracks: 260, plateTracks: 0 },
            tracks: [{ trackId: 1, box: [1, 2, 3, 4] }],
          },
        })}
        onRetry={() => {}}
      />,
    );
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.getByText("260")).toBeTruthy();
    expect(container.textContent).toContain("1920×1080");
    expect(container.textContent).not.toContain("trackId");
  });

  it("lists flagged tracks with their time span and jumps the video there when clicked", () => {
    const { container } = render(
      <VideoResultViewer
        job={job({
          status: "COMPLETED",
          progress: 100,
          resultSummary: { video: { width: 1920, height: 1080 }, counts: { faceTracks: 2 } },
        })}
        detections={[
          {
            label: "face",
            confidence: 0.4,
            box: [1, 2, 3, 4],
            redacted: true,
            whitelisted: false,
            whitelistRef: null,
            similarity: null,
            lowConfidence: true,
            needsReview: false,
            similarityNearThreshold: null,
            reviewReasons: ["Low confidence"],
            reviewNotes: ["low confidence 0.40"],
            trackId: 7,
            bestFrameMs: 66000,
            startMs: 65000,
            endMs: 70000,
          },
        ]}
        onRetry={() => {}}
      />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    video.pause = vi.fn();

    fireEvent.click(screen.getByRole("button", { name: /face.*1:05.0.*1:10.0/i }));

    // Jumps to the frame where the box was measured and draws it there.
    expect(video.currentTime).toBe(66);
    expect(container.querySelector("svg rect")).not.toBeNull();
    expect(screen.getByText(/low confidence 0\.40/i)).toBeTruthy();
  });
});
