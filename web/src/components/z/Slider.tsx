"use client";
import { Slider as BSlider } from "@base-ui/react/slider";

/** Single-thumb slider (timeline zoom). `label` is required: it is the accessible name. */
export function Slider({ label, value, defaultValue, min = 0, max = 100, step = 1, onValueChange, disabled, format }: {
  label: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  onValueChange?: (v: number) => void;
  format?: (v: number) => string;
}) {
  const controlled = value !== undefined ? { value } : { defaultValue: defaultValue ?? min };
  return (
    <BSlider.Root {...controlled} min={min} max={max} step={step} disabled={disabled} className="z-slider"
      onValueChange={(v) => onValueChange?.(Array.isArray(v) ? v[0] : v)}>
      <BSlider.Control className="z-slider-control">
        <BSlider.Track className="z-slider-track">
          <BSlider.Indicator className="z-slider-fill" />
          <BSlider.Thumb className="z-slider-thumb" getAriaLabel={() => label}
            getAriaValueText={format ? (formatted, v) => format(v) : undefined} />
        </BSlider.Track>
      </BSlider.Control>
    </BSlider.Root>
  );
}
