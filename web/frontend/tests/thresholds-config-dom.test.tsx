// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  batchConfigToFormConfig,
  DEFAULT_FORM_CONFIG,
  FormConfig,
  RedactionConfigForm,
} from "../src/components/RedactionConfigForm";

describe("Advanced Thresholds Configuration DOM Tests (Task 40 & 77)", () => {
  afterEach(() => {
    cleanup();
  });

  it("changing each threshold by its own label updates the submitted config", () => {
    let configState: FormConfig = { ...DEFAULT_FORM_CONFIG };
    const setConfig = vi.fn((updater: (prev: FormConfig) => FormConfig) => {
      configState = typeof updater === "function" ? updater(configState) : updater;
    });

    render(<RedactionConfigForm config={configState} setConfig={setConfig as any} />);

    // Face confidence
    const faceInput = screen.getByLabelText(/face confidence/i);
    fireEvent.change(faceInput, { target: { value: "0.65" } });
    expect(setConfig).toHaveBeenCalled();
    expect(configState.faceConfidenceThreshold).toBe(0.65);

    // Plate confidence
    const plateInput = screen.getByLabelText(/plate confidence/i);
    fireEvent.change(plateInput, { target: { value: "0.45" } });
    expect(configState.plateConfidenceThreshold).toBe(0.45);

    // Review threshold
    const reviewInput = screen.getByLabelText(/review threshold/i);
    fireEvent.change(reviewInput, { target: { value: "0.55" } });
    expect(configState.reviewThreshold).toBe(0.55);

    // Similarity threshold
    const similarityInput = screen.getByLabelText(/similarity threshold/i);
    fireEvent.change(similarityInput, { target: { value: "0.85" } });
    expect(configState.similarityThreshold).toBe(0.85);
  });
});
