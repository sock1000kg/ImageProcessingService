// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  batchConfigToFormConfig,
  DEFAULT_FORM_CONFIG,
  FormConfig,
  RedactionConfigForm,
  REDACTION_STRENGTH_RANGES,
} from "../src/components/RedactionConfigForm";

describe("Redaction Strength Box-Relative Sync (Task 85)", () => {
  afterEach(() => {
    cleanup();
  });

  describe("batchConfigToFormConfig strength fallbacks and clamping", () => {
    it("defaults strength to 15 for blur and 8 for pixelate when omitted", () => {
      const defaultBlur = batchConfigToFormConfig({});
      expect(defaultBlur.style).toBe("blur");
      expect(defaultBlur.strength).toBe(15);

      const defaultPixelate = batchConfigToFormConfig({ style: "pixelate" });
      expect(defaultPixelate.style).toBe("pixelate");
      expect(defaultPixelate.strength).toBe(8);
    });

    it("clamps stored out-of-range blur strength into 1-50", () => {
      const highBlur = batchConfigToFormConfig({ style: "blur", strength: 60 });
      expect(highBlur.strength).toBe(50);

      const lowBlur = batchConfigToFormConfig({ style: "blur", strength: 0 });
      expect(lowBlur.strength).toBe(1);

      const negativeBlur = batchConfigToFormConfig({ style: "blur", strength: -10 });
      expect(negativeBlur.strength).toBe(1);
    });

    it("clamps stored out-of-range pixelate strength into 3-32", () => {
      const highPixelate = batchConfigToFormConfig({ style: "pixelate", strength: 40 });
      expect(highPixelate.strength).toBe(32);

      const lowPixelate = batchConfigToFormConfig({ style: "pixelate", strength: 1 });
      expect(lowPixelate.strength).toBe(3);

      const negativePixelate = batchConfigToFormConfig({ style: "pixelate", strength: -5 });
      expect(negativePixelate.strength).toBe(3);
    });

    it("preserves stored in-range strength for both styles", () => {
      const validBlur = batchConfigToFormConfig({ style: "blur", strength: 25 });
      expect(validBlur.strength).toBe(25);

      const validPixelate = batchConfigToFormConfig({ style: "pixelate", strength: 16 });
      expect(validPixelate.strength).toBe(16);
    });
  });

  describe("RedactionConfigForm interactive behavior", () => {
    function ControlledForm({ initial = DEFAULT_FORM_CONFIG }: { initial?: FormConfig }) {
      const [config, setConfig] = useState<FormConfig>(initial);
      return <RedactionConfigForm config={config} setConfig={setConfig} />;
    }

    it("renders relative blur label and restricts slider to 1-50 initially", () => {
      render(<ControlledForm />);

      const slider = screen.getByLabelText(/strength/i, { selector: "input" }) as HTMLInputElement;
      expect(slider.min).toBe(String(REDACTION_STRENGTH_RANGES.blur.min));
      expect(slider.max).toBe(String(REDACTION_STRENGTH_RANGES.blur.max));
      expect(slider.value).toBe(String(REDACTION_STRENGTH_RANGES.blur.default));

      expect(screen.getByText(/15% of face\/plate width/i)).toBeDefined();
    });

    it("switching blur to pixelate resets strength to 8 and slider stays within 3-32", () => {
      render(<ControlledForm />);

      const select = screen.getByLabelText(/redaction style/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "pixelate" } });

      const slider = screen.getByLabelText(/strength/i, { selector: "input" }) as HTMLInputElement;
      expect(slider.min).toBe(String(REDACTION_STRENGTH_RANGES.pixelate.min));
      expect(slider.max).toBe(String(REDACTION_STRENGTH_RANGES.pixelate.max));
      expect(slider.value).toBe(String(REDACTION_STRENGTH_RANGES.pixelate.default));

      expect(screen.getByText(/8 cells across/i)).toBeDefined();
    });

    it("switching pixelate back to blur resets strength to 15 and slider stays within 1-50", () => {
      render(<ControlledForm initial={batchConfigToFormConfig({ style: "pixelate", strength: 20 })} />);

      const select = screen.getByLabelText(/redaction style/i) as HTMLSelectElement;
      expect(select.value).toBe("pixelate");

      fireEvent.change(select, { target: { value: "blur" } });

      const slider = screen.getByLabelText(/strength/i, { selector: "input" }) as HTMLInputElement;
      expect(slider.min).toBe(String(REDACTION_STRENGTH_RANGES.blur.min));
      expect(slider.max).toBe(String(REDACTION_STRENGTH_RANGES.blur.max));
      expect(slider.value).toBe(String(REDACTION_STRENGTH_RANGES.blur.default));
      expect(screen.getByText(/15% of face\/plate width/i)).toBeDefined();
    });

    it("hides strength slider when style is blackout", () => {
      render(<ControlledForm />);

      const select = screen.getByLabelText(/redaction style/i) as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "blackout" } });

      expect(screen.queryByLabelText(/strength/i, { selector: "input" })).toBeNull();
    });
  });
});
