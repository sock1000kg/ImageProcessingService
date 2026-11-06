// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORM_CONFIG, FormConfig, RedactionConfigForm } from "../src/components/RedactionConfigForm";

describe("Advanced Thresholds Configuration DOM Tests (Task 40)", () => {
  afterEach(() => {
    cleanup();
  });

  it("changing a threshold updates the submitted config", () => {
    let configState: FormConfig = { ...DEFAULT_FORM_CONFIG };
    const setConfig = vi.fn((updater: (prev: FormConfig) => FormConfig) => {
      configState = typeof updater === "function" ? updater(configState) : updater;
    });

    render(<RedactionConfigForm config={configState} setConfig={setConfig as any} />);

    const confidenceInput = screen.getByLabelText(/confidence/i);
    fireEvent.change(confidenceInput, { target: { value: "0.65" } });
    expect(setConfig).toHaveBeenCalled();
    expect(configState.confidenceThreshold).toBe(0.65);
  });
});
