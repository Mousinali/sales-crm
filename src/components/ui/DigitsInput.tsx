"use client";

import type { InputHTMLAttributes } from "react";
import { digitsOnly } from "@/lib/validation";

type DigitsInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "inputMode" | "maxLength"> & {
  value: string;
  onValueChange: (digits: string) => void;
  maxLength: number;
};

/** Text input that only ever holds digits — typing or pasting anything else is dropped. */
export default function DigitsInput({ value, onValueChange, maxLength, ...inputProps }: DigitsInputProps) {
  return (
    <input
      {...inputProps}
      type="text"
      inputMode="numeric"
      autoComplete={inputProps.autoComplete ?? "off"}
      maxLength={maxLength}
      value={value}
      onChange={(event) => onValueChange(digitsOnly(event.target.value, maxLength))}
    />
  );
}
