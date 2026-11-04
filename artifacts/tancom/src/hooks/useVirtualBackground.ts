import { useEffect, useRef, useState } from "react";

export type VirtualBg = null | "blur" | string;

export const VB_STORAGE_KEY = "tancom-virtual-bg";

export function getSavedBackground(): VirtualBg {
  try {
    const v = localStorage.getItem(VB_STORAGE_KEY);
    if (!v || v === "null") return null;
    return v as VirtualBg;
  } catch {
    return null;
  }
}

export function saveBackground(bg: VirtualBg): void {
  try {
    localStorage.setItem(VB_STORAGE_KEY, bg ?? "null");
  } catch {}
}

// ── MediaPipe Tasks Vision (replaces old selfie_segmentation@0.1) ─────────────
//
// Upgrade rationale:
//   • Old model:  binary mask → harsh edges, frequent flickering
//   • New model:  float32 confidence mask → smooth per-pixel alpha, GPU inference
//   • Landscape model: trained for 16:9 webcam orientation — better person edges
//
// Loading strategy:
//   • Dynamic CDN import keeps bundle size zero (no npm install needed)
//   • Singleton promise: WASM + model load once, reused across camera changes
//   • GPU delegate: inference off the main thread, typically <8 ms per frame
//   • VIDEO runningMode: synchronous segmentForVideo() fits cleanly in RAF loop

const TASKS_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/vision_bundle.mjs";
const WASM_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/" +
  "selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let segmenterPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSegmenter(): Promise<any> {
  if (segmenterPromise) return segmenterPromise;
  segmenterPromise = (async () => {
    // @vite-ignore: CDN URL — Vite must not try to resolve this as a local module
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vision = (await import(/* @vite-ignore */ TASKS_CDN)) as any;
    const { ImageSegmenter, FilesetResolver } = vision;
    const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        // GPU delegate: inference runs on the GPU, freeing the main thread.
        // Falls back to CPU automatically if GPU is unavailable.
        delegate: "GPU",
      },
      outputCategoryMask: false,
      // Float32 confidence values per pixel (0 = background, 1 = person).
      // These natural gradients at person boundaries produce far smoother
      // edges than the old binary mask without any blur tricks.
      outputConfidenceMasks: true,
      // VIDEO mode: segmentForVideo() is synchronous, fits RAF loop cleanly.
      runningMode: "VIDEO",
    });
  })().catch((err: unknown) => {
    segmenterPromise = null; // allow retry on next call
    throw err;
  });
  return segmenterPromise;
}

// ── Canvas geometry ───────────────────────────────────────────────────────────
//
// Segmentation input: 640×360 — small enough for fast inference + compact
//   float mask (230 K values vs 2 M for 1080p). The model downscales
//   internally anyway; passing a smaller canvas avoids the GPU→CPU copy cost.
//
// Output: 1280×720 HD — matches the h720 LiveKit simulcast layer.
//   The camera is captured at 1080p; with a virtual background the output
//   is constrained by this canvas, so matching HD gives the best quality
//   that LiveKit can actually encode without wasting bits.
//
// Mask upscaling: maskCanvas (640×360) is drawn onto personCanvas (1280×720)
//   via drawImage(), which bilinearly interpolates the mask. This turns the
//   sharp 640px edge into a smooth 2–4 px gradient at output resolution —
//   the same technique Zoom uses for natural-looking person boundaries.

const SEG_W = 640;
const SEG_H = 360;
const OUT_W = 1280;
const OUT_H = 720;

const TARGET_FPS = 30;
const FRAME_MS = 1000 / TARGET_FPS;

// Exponential Moving Average weight for temporal mask smoothing.
// Higher = more responsive (less smoothing), lower = smoother (more lag).
// 0.65 keeps edges stable under subtle movements without noticeable lag.
const EMA_ALPHA = 0.65;

export function useVirtualBackground({
  cameraStream,
  background,
}: {
  cameraStream: MediaStream | null;
  background: VirtualBg;
}) {
  const [processedStream, setProcessedStream] = useState<MediaStream | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  // Background image element — kept in sync with the `background` prop via a
  // separate effect so we can swap images without restarting the pipeline.
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Mirror background into a ref so onResults can read it without restarting.
  const backgroundRef = useRef<VirtualBg>(background);
  useEffect(() => {
    backgroundRef.current = background;
  }, [background]);

  // Pre-load the background image whenever the URL changes.
  useEffect(() => {
    if (background && background !== "blur") {
      const img = new Image();
      if (!background.startsWith("data:")) img.crossOrigin = "anonymous";
      img.src = background;
      img.onload = () => {
        bgImageRef.current = img;
      };
      img.onerror = () => {
        bgImageRef.current = null;
      };
    } else {
      bgImageRef.current = null;
    }
  }, [background]);

  // ── Main pipeline — restarts only when camera stream or bg-active changes ──
  const bgActive = !!background;

  useEffect(() => {
    if (!cameraStream || !bgActive) {
      setProcessedStream(null);
      return;
    }

    // LOCAL alive flag — not a ref — so each run has its own independent copy.
    // Prevents zombie pipelines from a previous cleanup writing to new canvases.
    let alive = true;
    setIsLoading(true);

    let rafId = 0;
    let lastFrameAt = 0;

    // Temporal smoothing buffer: EMA of float confidence masks across frames.
    // Null until first result arrives.
    let prevMask: Float32Array | null = null;

    // ── Canvases ────────────────────────────────────────────────────────────

    // segCanvas: downsampled camera frame fed to the segmenter.
    const segCanvas = document.createElement("canvas");
    segCanvas.width = SEG_W;
    segCanvas.height = SEG_H;
    const segCtx = segCanvas.getContext("2d", { willReadFrequently: false })!;

    // maskCanvas: greyscale representation of the smoothed confidence mask.
    // Only the alpha channel is updated each frame; R/G/B stay at 255.
    // Used as a destination-in clip mask on personCanvas.
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = SEG_W;
    maskCanvas.height = SEG_H;
    const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: false })!;
    const maskImageData = new ImageData(SEG_W, SEG_H);
    const maskPixels = maskImageData.data;
    // Pre-fill RGB to white — only alpha changes per frame.
    for (let i = 0; i < maskPixels.length; i += 4) {
      maskPixels[i] = 255;     // R
      maskPixels[i + 1] = 255; // G
      maskPixels[i + 2] = 255; // B
      maskPixels[i + 3] = 255; // A  ← updated per frame
    }

    // personCanvas: full-quality camera frame, alpha-clipped by the mask.
    const personCanvas = document.createElement("canvas");
    personCanvas.width = OUT_W;
    personCanvas.height = OUT_H;
    const personCtx = personCanvas.getContext("2d", {
      willReadFrequently: false,
    })!;
    personCtx.imageSmoothingEnabled = true;
    personCtx.imageSmoothingQuality = "high";

    // outCanvas: composited background + person — this is what peers receive.
    const outCanvas = document.createElement("canvas");
    outCanvas.width = OUT_W;
    outCanvas.height = OUT_H;
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: false })!;
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";
    // Initial black frame so captureStream() has content immediately.
    outCtx.fillStyle = "#000";
    outCtx.fillRect(0, 0, OUT_W, OUT_H);

    // video: feeds camera frames into both the segmenter and compositing.
    const video = document.createElement("video");
    video.srcObject = cameraStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;

    // Output stream: canvas video track + original audio (mic).
    const outStream = outCanvas.captureStream(TARGET_FPS);
    cameraStream.getAudioTracks().forEach((t) => outStream.addTrack(t));

    // ── Per-frame compositing ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function processFrame(segmenter: any, now: number) {
      if (!alive || video.readyState < 2) return;
      if (now - lastFrameAt < FRAME_MS) return;
      lastFrameAt = now;

      // 1. Downsample camera to segmentation resolution.
      segCtx.drawImage(video, 0, 0, SEG_W, SEG_H);

      // 2. Synchronous GPU segmentation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;
      try {
        result = segmenter.segmentForVideo(segCanvas, now);
      } catch {
        return; // segmenter may not be ready on the very first frame
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const confMasks = result.confidenceMasks as any[] | undefined;
      if (!confMasks?.length) {
        try { result.close(); } catch { /* ignore */ }
        return;
      }

      const confMask = confMasks[0];
      // Copy float values (0 = background, 1 = person) to CPU.
      const maskFloat = confMask.getAsFloat32Array() as Float32Array;
      try { confMask.close(); } catch { /* ignore */ }
      try { result.close(); } catch { /* ignore */ }

      // 3. Temporal EMA smoothing — blends current mask with the previous frame
      //    to eliminate the rapid mask jitter that makes edges appear to crawl.
      if (!prevMask || prevMask.length !== maskFloat.length) {
        prevMask = new Float32Array(maskFloat);
      } else {
        for (let i = 0; i < prevMask.length; i++) {
          prevMask[i] = prevMask[i] * (1 - EMA_ALPHA) + maskFloat[i] * EMA_ALPHA;
        }
      }

      // 4. Convert smoothed float mask → alpha channel of maskImageData.
      //    Linear remap: [0.05, 0.95] → [0, 255] tightens the edge zone
      //    (low-confidence fringe pixels become transparent; high-confidence
      //    interior pixels become fully opaque) while the 10% gradient zone
      //    around 0.5 gives a naturally feathered edge.
      for (let i = 0, j = 3; i < prevMask.length; i++, j += 4) {
        const v = prevMask[i];
        const remapped = v < 0.05 ? 0 : v > 0.95 ? 1 : (v - 0.05) / 0.9;
        maskPixels[j] = Math.round(remapped * 255);
      }
      maskCtx.putImageData(maskImageData, 0, 0);

      // 5. Draw background layer.
      const bg = backgroundRef.current;
      outCtx.save();
      outCtx.clearRect(0, 0, OUT_W, OUT_H);

      if (bg === "blur") {
        // Overscan by 24 px so the blur fringe never shows at the edges.
        outCtx.filter = "blur(20px)";
        outCtx.drawImage(video, -24, -24, OUT_W + 48, OUT_H + 48);
        outCtx.filter = "none";
      } else if (bgImageRef.current) {
        const bw = bgImageRef.current.naturalWidth || bgImageRef.current.width;
        const bh =
          bgImageRef.current.naturalHeight || bgImageRef.current.height;
        if (bw > 0 && bh > 0) {
          // Cover-crop: fill canvas while preserving image aspect ratio.
          const imgAR = bw / bh;
          const canvasAR = OUT_W / OUT_H;
          let sx = 0, sy = 0, sw = bw, sh = bh;
          if (imgAR > canvasAR) {
            sw = bh * canvasAR;
            sx = (bw - sw) / 2;
          } else {
            sh = bw / canvasAR;
            sy = (bh - sh) / 2;
          }
          outCtx.drawImage(
            bgImageRef.current,
            sx, sy, sw, sh,
            -2, -2, OUT_W + 4, OUT_H + 4
          );
        }
      } else {
        // Background image selected but not yet loaded — show blurred camera
        // so the canvas is never empty during the load delay.
        outCtx.filter = "blur(20px)";
        outCtx.drawImage(video, -24, -24, OUT_W + 48, OUT_H + 48);
        outCtx.filter = "none";
      }

      // 6. Draw person layer: full-res camera frame clipped by the mask.
      //
      //    maskCanvas is 640×360; drawing it onto the 1280×720 personCanvas
      //    via drawImage() bilinearly upsamples it 2×.  This turns the 1–2 px
      //    edge zone at seg resolution into a smooth 2–4 px gradient at output
      //    resolution, producing natural-looking person boundaries without any
      //    CSS blur on the mask itself.
      personCtx.save();
      personCtx.clearRect(0, 0, OUT_W, OUT_H);
      personCtx.drawImage(video, 0, 0, OUT_W, OUT_H);
      personCtx.globalCompositeOperation = "destination-in";
      personCtx.drawImage(maskCanvas, 0, 0, OUT_W, OUT_H);
      personCtx.restore();

      outCtx.drawImage(personCanvas, 0, 0);
      outCtx.restore();
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let segmenterInstance: any = null;

    function loop(now: number) {
      if (!alive) return;
      if (segmenterInstance) processFrame(segmenterInstance, now);
      rafId = requestAnimationFrame(loop);
    }

    function startVideoPlayback() {
      video.play().catch(() => {
        video.addEventListener(
          "canplay",
          () => { video.play().catch(() => {}); },
          { once: true }
        );
      });
    }

    loadSegmenter()
      .then((seg) => {
        if (!alive) return;
        segmenterInstance = seg;
        startVideoPlayback();
        setProcessedStream(outStream);
        setIsLoading(false);
        rafId = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (alive) {
          setIsLoading(false);
          setProcessedStream(null);
        }
      });

    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      // Stop only the video track from the canvas stream — stopping audio tracks
      // here would silence the user's mic for the rest of the session.
      outStream.getVideoTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
      prevMask = null;
      setProcessedStream(null);
      setIsLoading(false);
    };
    // Only restart when the camera stream changes or VB is toggled on/off.
    // Background image/blur switching is handled via refs — no restart needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStream, bgActive]);

  return { processedStream, isLoading };
}
