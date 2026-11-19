"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  KeyRound,
  Loader2,
  QrCode,
  RotateCcw,
  ScanLine,
} from "lucide-react";

type ResultState =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "success"; message: string; sessionTitle?: string }
  | { kind: "duplicate"; message: string; sessionTitle?: string }
  | { kind: "error"; message: string; sessionTitle?: string };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

// The same rule as the server. A six digit value is the manual fallback code,
// everything else is the QR token.
const MANUAL_CODE_PATTERN = /^\d{6}$/;

// The camera reads the same code many times in a row. The same value is never
// sent twice, so a scan cannot fill the rate limit of the cadet.
const REPEAT_SUBMIT_WINDOW_MS = 60_000;

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (
    window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;

  return candidate ?? null;
}

export default function CheckInClient() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const lastSubmittedRef = useRef<{ value: string; at: number } | null>(null);

  const [manualToken, setManualToken] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [cameraState, setCameraState] = useState<
    "idle" | "starting" | "running" | "unsupported" | "denied"
  >("idle");
  const [result, setResult] = useState<ResultState>({ kind: "idle" });

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }

      streamRef.current = null;
    }

    setCameraState("idle");
  }, []);

  const submitToken = useCallback(
    async (value: string) => {
      const clean = value.trim();

      if (clean.length === 0 || submittingRef.current) {
        return;
      }

      const last = lastSubmittedRef.current;

      if (
        last &&
        last.value === clean &&
        Date.now() - last.at < REPEAT_SUBMIT_WINDOW_MS
      ) {
        return;
      }

      submittingRef.current = true;
      lastSubmittedRef.current = { value: clean, at: Date.now() };
      setResult({ kind: "working", message: "Checking the code..." });

      try {
        const response = await fetch("/api/attendance/check-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            MANUAL_CODE_PATTERN.test(clean) ? { code: clean } : { token: clean }
          ),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload.error ?? "The check-in could not be completed");
        }

        if (payload.duplicate) {
          setResult({
            kind: "duplicate",
            message: "You are already marked for this session.",
            sessionTitle: payload.session?.title,
          });
        } else {
          setResult({
            kind: "success",
            message: "You are marked present for this session.",
            sessionTitle: payload.session?.title,
          });
        }

        // The check-in is done. The camera stops so the same code is not
        // scanned again and again.
        stopCamera();
      } catch (error) {
        setResult({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The check-in could not be completed",
        });
      } finally {
        submittingRef.current = false;
      }
    },
    [stopCamera]
  );

  const startCamera = useCallback(async () => {
    const Detector = getBarcodeDetector();

    if (!Detector) {
      setCameraState("unsupported");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      return;
    }

    setCameraState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        stopCamera();
        return;
      }

      video.srcObject = stream;
      await video.play();

      setCameraState("running");

      const detector = new Detector({ formats: ["qr_code"] });

      const scan = async () => {
        if (!streamRef.current || !videoRef.current) {
          return;
        }

        try {
          const codes = await detector.detect(videoRef.current);

          const value = codes[0]?.rawValue;

          if (value && !submittingRef.current) {
            await submitToken(value.trim());
          }
        } catch {
          setCameraState("idle");
          return;
        }

        frameRef.current = requestAnimationFrame(() => {
          void scan();
        });
      };

      frameRef.current = requestAnimationFrame(() => {
        void scan();
      });
    } catch {
      setCameraState("denied");
    }
  }, [stopCamera, submitToken]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const trimmedCode = manualCode.trim();

  return (
    <div className="py-6 sm:py-10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-6">
        <header className="bg-ncc-dark-blue text-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-xl">
          <h1 className="font-heading font-black text-xl sm:text-2xl">
            Check in with the QR code
          </h1>
          <p className="text-white/70 text-xs sm:text-sm mt-2">
            Scan the code that the officer displays, or type the six digit code
            they read out. The code only works for the open session it belongs
            to.
          </p>
        </header>

        {result.kind !== "idle" && result.kind !== "working" ? (
          <div
            role="status"
            className={`p-4 rounded-2xl border text-sm flex items-start gap-3 ${
              result.kind === "success"
                ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                : result.kind === "duplicate"
                  ? "bg-amber-50 border-amber-300 text-amber-900"
                  : "bg-red-50 border-red-300 text-red-900"
            }`}
          >
            {result.kind === "success" ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <div>
              <p className="font-bold">{result.message}</p>
              {result.sessionTitle ? (
                <p className="text-xs mt-1">{result.sessionTitle}</p>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="w-5 h-5 text-ncc-red" />
            <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
              Camera scanner
            </h2>
          </div>

          <div className="rounded-2xl overflow-hidden bg-gray-900 aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${
                cameraState === "running" ? "block" : "hidden"
              }`}
            />
            {cameraState !== "running" ? (
              <div className="text-center px-6">
                <Camera className="w-10 h-10 text-white/40 mx-auto mb-3" />
                <p className="text-xs text-white/70">
                  {cameraState === "unsupported"
                    ? "This browser cannot read QR codes. Use the code entry below."
                    : cameraState === "denied"
                      ? "The camera permission was refused. Use the code entry below."
                      : cameraState === "starting"
                        ? "Starting the camera..."
                        : "The camera stays on your device. Nothing is recorded."}
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            {cameraState === "running" ? (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold touch-target"
              >
                <RotateCcw className="w-4 h-4" /> Stop the camera
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startCamera()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-light-blue text-white text-xs font-bold touch-target"
              >
                {cameraState === "starting" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
                Start the camera
              </button>
            )}
          </div>
        </section>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-ncc-red" />
            <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
              Type the fallback code
            </h2>
          </div>

          <p className="text-xs text-gray-600 mb-3">
            Use this option when the camera is not available. The officer reads
            out the six digit code of the open session.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitToken(trimmedCode);
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <label htmlFor="manual-code" className="sr-only">
              Six digit check-in code
            </label>
            <input
              id="manual-code"
              value={manualCode}
              onChange={(event) => {
                setManualCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              }}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 text-sm tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
            />
            <button
              type="submit"
              disabled={result.kind === "working" || trimmedCode.length !== 6}
              className="px-5 py-2.5 rounded-xl bg-ncc-red hover:bg-ncc-red-light text-white text-sm font-bold disabled:opacity-50 touch-target"
            >
              {result.kind === "working" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Check in"
              )}
            </button>
          </form>
        </section>

        <section className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <QrCode className="w-5 h-5 text-ncc-red" />
            <h2 className="font-heading font-bold text-gray-900 text-base sm:text-lg">
              Paste the QR token
            </h2>
          </div>

          <p className="text-xs text-gray-600 mb-3">
            Use this option when the officer shares the link of the QR code
            instead of showing the screen.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitToken(manualToken.trim());
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <label htmlFor="manual-token" className="sr-only">
              Check-in token
            </label>
            <input
              id="manual-token"
              value={manualToken}
              onChange={(event) => setManualToken(event.target.value)}
              placeholder="Paste the token"
              autoComplete="off"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-ncc-dark-blue"
            />
            <button
              type="submit"
              disabled={result.kind === "working" || manualToken.trim().length < 20}
              className="px-5 py-2.5 rounded-xl bg-ncc-dark-blue hover:bg-ncc-light-blue text-white text-sm font-bold disabled:opacity-50 touch-target"
            >
              {result.kind === "working" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Check in"
              )}
            </button>
          </form>

          <p className="mt-4 text-[11px] text-gray-500">
            A QR code can be photographed, so it is not proof that you were
            physically there. The officer supervises the check-in.
          </p>

          <Link
            href="/attendance"
            className="mt-3 inline-block text-xs font-semibold text-ncc-dark-blue underline"
          >
            Back to my attendance
          </Link>
        </section>
      </div>
    </div>
  );
}
