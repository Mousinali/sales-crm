"use client";

import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes } from "react";

/**
 * Indian digit grouping: the last three digits, then pairs — 1,00,000 rather
 * than the 100,000 that `toLocaleString()` with a non-en-IN locale would give.
 * Done on the digit string instead of via Number so a half-typed value keeps
 * exactly what was typed (trailing ".", trailing zeros) and nothing is lost to
 * float rounding on large amounts.
 */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  return `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`;
}

/** Raw stored value ("100000", "1000.5") -> what's shown ("1,00,000", "1,000.5"). */
export function formatMoney(raw: string): string {
  if (!raw) return "";
  const [intPart, ...decParts] = raw.split(".");
  const grouped = groupIndian(intPart);
  // `raw.includes(".")` rather than checking decParts[0], so a trailing "."
  // survives while the user is still mid-way through typing the paise.
  return raw.includes(".") ? `${grouped}.${decParts.join("")}` : grouped;
}

/** What's shown -> what the form stores and submits (`Number()`-parseable). */
export function toRawMoney(display: string, allowDecimals: boolean): string {
  const cleaned = display.replace(/[^\d.]/g, "");
  if (!allowDecimals) return cleaned.replace(/\./g, "");
  const [first, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${first}.${rest.join("")}` : first;
}

type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Unformatted, as stored in form state — e.g. "100000". */
  value: string;
  /** Receives the unformatted value, so callers keep doing `Number(value)`. */
  onValueChange: (raw: string) => void;
  allowDecimals?: boolean;
};

/**
 * A text input that shows money grouped the Indian way as it's typed, while
 * handing the caller back a plain numeric string. Deliberately not
 * `type="number"`: a number input rejects the commas outright.
 */
export default function MoneyInput({
  value,
  onValueChange,
  allowDecimals = true,
  ...inputProps
}: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // How many digits sat left of the caret before reformatting; null when the
  // change came from somewhere other than typing (so the caret is left alone).
  const digitsBeforeCaret = useRef<number | null>(null);

  const display = formatMoney(value);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const target = digitsBeforeCaret.current;
    digitsBeforeCaret.current = null;
    if (!input || target === null) return;

    // Re-place the caret after the same digit it followed before the commas
    // shifted, otherwise editing mid-number throws the caret to the end on
    // every keystroke.
    let seen = 0;
    let position = display.length;
    if (target === 0) {
      position = 0;
    } else {
      for (let i = 0; i < display.length; i++) {
        if (/[\d.]/.test(display[i])) seen++;
        if (seen === target) {
          position = i + 1;
          break;
        }
      }
    }
    input.setSelectionRange(position, position);
  }, [display]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { value: typed, selectionStart } = event.target;
    const caret = selectionStart ?? typed.length;
    digitsBeforeCaret.current = typed.slice(0, caret).replace(/[^\d.]/g, "").length;
    onValueChange(toRawMoney(typed, allowDecimals));
  }

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      inputMode={allowDecimals ? "decimal" : "numeric"}
      value={display}
      onChange={handleChange}
    />
  );
}
