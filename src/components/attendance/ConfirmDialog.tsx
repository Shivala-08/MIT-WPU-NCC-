"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  busy?: boolean;
  reason?: {
    label: string;
    placeholder?: string;
    minLength?: number;
    required?: boolean;
    helper?: string;
  };
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
};

/**
 * An accessible confirmation dialog.
 *
 * The dialog keeps the focus inside, closes with the escape key and can ask
 * for a written reason. It replaces the browser prompt of the unit.
 *
 * The body is a separate component. It is mounted only while the dialog is
 * open, so the typed reason never survives from one action to the next and
 * the component does not have to reset its own state in an effect.
 */
export default function ConfirmDialog(props: ConfirmDialogProps) {
  if (!props.open) {
    return null;
  }

  return <ConfirmDialogBody {...props} />;
}

function ConfirmDialogBody({
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  reason,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
      );

      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, onCancel]);

  const handleConfirm = () => {
    const clean = value.trim();
    const minLength = reason?.minLength ?? 5;

    if (reason?.required && clean.length < minLength) {
      setError(`The reason needs at least ${minLength} characters`);
      return;
    }

    setError(null);
    void onConfirm(clean);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ncc-dark-blue/70 backdrop-blur-sm"
        onClick={() => {
          if (!busy) {
            onCancel();
          }
        }}
        aria-hidden="true"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-gray-200 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          {tone === "danger" ? (
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          ) : null}

          <div className="flex-1 min-w-0">
            <h2
              id={titleId}
              className="font-heading font-bold text-gray-900 text-base sm:text-lg"
            >
              {title}
            </h2>
            <p
              id={descriptionId}
              className="text-xs sm:text-sm text-gray-600 mt-2 whitespace-pre-line"
            >
              {description}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close the dialog"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50 touch-target"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {reason ? (
          <div className="mt-4">
            <label
              htmlFor={`${titleId}-reason`}
              className="block text-xs font-bold text-gray-700 mb-1"
            >
              {reason.label}
            </label>
            <textarea
              id={`${titleId}-reason`}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(null);
              }}
              rows={3}
              maxLength={500}
              required={reason.required}
              placeholder={reason.placeholder}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${titleId}-reason-help`}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
            />
            <p id={`${titleId}-reason-help`} className="text-[11px] text-gray-500 mt-1">
              {reason.helper ??
                `The reason is stored in the audit history. It needs at least ${
                  reason.minLength ?? 5
                } characters.`}
            </p>

            {error ? (
              <p role="alert" className="text-xs text-red-700 mt-2">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold disabled:opacity-50 touch-target"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-50 touch-target ${
              tone === "danger"
                ? "bg-ncc-red hover:bg-ncc-red-light"
                : "bg-ncc-dark-blue hover:bg-ncc-light-blue"
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
