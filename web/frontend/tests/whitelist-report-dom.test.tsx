// @vitest-environment happy-dom
/**
 * Tests for Whitelist people section in BatchReport (Task 58):
 * - Displays person's name or fallback "Allow list #n" label
 * - Renders neutral placeholder when thumbnail fetch fails without breaking the row
 * - Collapsed by default: head row has aria-expanded="false" and images are hidden
 * - Clicking head row expands image rows and sets aria-expanded="true"
 * - Second click collapses image rows and sets aria-expanded="false"
 * - Opening one person does not open another person
 * - Person with no images has no expand button / control
 * - Clicking an image row invokes onSelectImage with the job ID
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchReport } from "../src/components/BatchReport";
import { BatchReport as Report } from "../src/types";

// Mock usePresignedUrl hook
vi.mock("../src/hooks/usePresignedUrl", () => ({
  usePresignedUrl: vi.fn((path?: string | null) => {
    if (!path) return { url: null, loading: false, error: false };
    // Simulate failed thumbnail fetch for person 2 (/whitelist/2/url)
    if (path.endsWith("/whitelist/2/url")) return { url: null, loading: false, error: true };
    return { url: `http://localhost:9000/fake-img-${path}`, loading: false, error: false };
  }),
  clearPresignedUrlCache: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BatchReport Whitelist People Component (Task 58)", () => {
  const sampleReport: Report = {
    batchId: "123e4567-e89b-12d3-a456-426614174000",
    status: "COMPLETED",
    totals: {
      images: 4,
      completed: 4,
      failed: 0,
      faces: 5,
      plates: 2,
      redacted: 3,
      whitelisted: 2,
      lowConfidence: 1,
    },
    images: [],
    lowConfidenceDetections: [],
    reviewImages: [
      {
        jobId: "job-review-1",
        originalFilename: "needs-review-1.jpg",
        reviewReasons: ["Low confidence"],
        reviewNotes: ["confidence 0.35 below threshold 0.50"],
      },
    ],
    reviewDetections: [],
    whitelistPeople: [
      {
        whitelistRef: 0,
        whitelistKey: "key-person-0",
        name: "Alice Profile Photo.jpg",
        images: [
          { jobId: "job-wl-1", originalFilename: "candidate-a.jpg" },
          { jobId: "job-wl-2", originalFilename: "candidate-b.jpg" },
        ],
        imageCount: 2,
        detectionCount: 3,
      },
      {
        whitelistRef: 1,
        whitelistKey: "key-person-1",
        name: null,
        images: [{ jobId: "job-wl-3", originalFilename: "candidate-c.jpg" }],
        imageCount: 1,
        detectionCount: 1,
      },
      {
        whitelistRef: 2,
        whitelistKey: "key-person-2",
        name: "Charlie Empty",
        images: [],
        imageCount: 0,
        detectionCount: 0,
      },
    ],
  };

  it("shows the API's name for a person with name, and falls back to Whitelist #n when name is null", () => {
    render(<BatchReport report={sampleReport} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });
    expect(within(whitelistSection).getByText("Alice Profile Photo.jpg")).toBeTruthy();
    expect(within(whitelistSection).getByText("Allow list #2")).toBeTruthy();
    expect(within(whitelistSection).getByText("Charlie Empty")).toBeTruthy();

    // The reference numbers remain visible in badges
    expect(within(whitelistSection).getByText("#1")).toBeTruthy();
    expect(within(whitelistSection).getByText("#2")).toBeTruthy();
    expect(within(whitelistSection).getByText("#3")).toBeTruthy();
  });

  it("renders a neutral placeholder on failed thumbnail without breaking the row", () => {
    render(<BatchReport report={sampleReport} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });
    // Person 2 (whitelist/2) fails and renders a placeholder
    const placeholders = whitelistSection.querySelectorAll(".thumbnail-placeholder");
    expect(placeholders.length).toBeGreaterThanOrEqual(1);

    // Row is still fully rendered and functional
    expect(within(whitelistSection).getByText("Allow list #2")).toBeTruthy();
  });

  it("resets imgError state when url changes", () => {
    const { rerender } = render(<BatchReport report={sampleReport} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });
    const aliceButton = within(whitelistSection).getByRole("button", {
      name: /Alice Profile Photo\.jpg/i,
    });
    const img = aliceButton.querySelector("img");
    expect(img).toBeTruthy();

    // Trigger image error on Alice's thumbnail
    fireEvent.error(img!);

    // Alice should now show placeholder instead of the failed img
    expect(aliceButton.querySelector("img")).toBeNull();
    expect(aliceButton.querySelector(".thumbnail-placeholder")).toBeTruthy();

    // Re-render with new batchId (changing url)
    const updatedReport = {
      ...sampleReport,
      batchId: "222e4567-e89b-12d3-a456-426614174000",
    };
    rerender(<BatchReport report={updatedReport} />);

    // The image should be rendered again (imgError reset on url change)
    const updatedAliceButton = within(screen.getByRole("region", { name: /allow list/i })).getByRole("button", {
      name: /Alice Profile Photo\.jpg/i,
    });
    expect(updatedAliceButton.querySelector("img")).toBeTruthy();
  });

  it("collapses images by default, expands on click, and collapses again on second click", () => {
    const onSelect = vi.fn();
    render(<BatchReport report={sampleReport} onSelectImage={onSelect} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });

    // Initially collapsed: candidates are not visible
    expect(within(whitelistSection).queryByText("candidate-a.jpg")).toBeNull();
    expect(within(whitelistSection).queryByText("candidate-b.jpg")).toBeNull();

    const aliceButton = within(whitelistSection).getByRole("button", {
      name: /Alice Profile Photo\.jpg/i,
    });
    expect(aliceButton.getAttribute("aria-expanded")).toBe("false");

    // First click: expands images
    fireEvent.click(aliceButton);
    expect(aliceButton.getAttribute("aria-expanded")).toBe("true");
    expect(within(whitelistSection).getByText("candidate-a.jpg")).toBeTruthy();
    expect(within(whitelistSection).getByText("candidate-b.jpg")).toBeTruthy();

    // Clicking an image row invokes onSelectImage
    const candidateItem = within(whitelistSection).getByText("candidate-a.jpg");
    fireEvent.click(candidateItem);
    expect(onSelect).toHaveBeenCalledWith("job-wl-1");

    // Second click on head row: collapses images again
    fireEvent.click(aliceButton);
    expect(aliceButton.getAttribute("aria-expanded")).toBe("false");
    expect(within(whitelistSection).queryByText("candidate-a.jpg")).toBeNull();
  });

  it("opening one person does not open another person", () => {
    render(<BatchReport report={sampleReport} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });

    const aliceButton = within(whitelistSection).getByRole("button", {
      name: /Alice Profile Photo\.jpg/i,
    });
    const person2Button = within(whitelistSection).getByRole("button", {
      name: /allow list #2/i,
    });

    expect(aliceButton.getAttribute("aria-expanded")).toBe("false");
    expect(person2Button.getAttribute("aria-expanded")).toBe("false");

    // Expand person 1
    fireEvent.click(aliceButton);
    expect(aliceButton.getAttribute("aria-expanded")).toBe("true");
    // Person 2 remains collapsed
    expect(person2Button.getAttribute("aria-expanded")).toBe("false");
    expect(within(whitelistSection).queryByText("candidate-c.jpg")).toBeNull();
  });

  it("person with no images has no expand button / control", () => {
    render(<BatchReport report={sampleReport} />);

    const whitelistSection = screen.getByRole("region", { name: /allow list/i });

    // Charlie has 0 images: should render as text, NOT a button
    expect(within(whitelistSection).getByText("Charlie Empty")).toBeTruthy();
    expect(
      within(whitelistSection).queryByRole("button", {
        name: /Charlie Empty/i,
      }),
    ).toBeNull();
  });
});
