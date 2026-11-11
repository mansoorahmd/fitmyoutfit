/**
 * Test files for the upload checks, made in the browser by code (nothing is
 * downloaded): they go through exactly the same upload path as a file the
 * customer picks.
 */

function canvasFile(width: number, height: number, type: "image/png" | "image/jpeg", name: string, paint: (ctx: CanvasRenderingContext2D) => void): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("no 2D canvas"));
  paint(ctx);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], name, { type })) : reject(new Error("could not encode"))), type, 0.9),
  );
}

/** A round club badge on a transparent background. */
function badge(ctx: CanvasRenderingContext2D, size: number) {
  const r = size / 2;
  ctx.fillStyle = "#1B2A5C";
  ctx.beginPath();
  ctx.arc(r, r, r * 0.96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F2B705";
  ctx.beginPath();
  ctx.arc(r, r, r * 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#C8102E";
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 === 0 ? r * 0.62 : r * 0.26;
    ctx.lineTo(r + rr * Math.cos(a), r + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

export interface SampleFile {
  id: string;
  label: string;
  make: () => Promise<File>;
}

export const SAMPLE_FILES: SampleFile[] = [
  { id: "badge", label: "Badge, transparent PNG (600 px)", make: () => canvasFile(600, 600, "image/png", "badge.png", (ctx) => badge(ctx, 600)) },
  // 200 px prints sharp up to 33 mm at 150 DPI: make it bigger to see the resolution warning.
  { id: "small", label: "Small logo, PNG (200 px)", make: () => canvasFile(200, 200, "image/png", "small-logo.png", (ctx) => badge(ctx, 200)) },
  {
    id: "opaque",
    label: "Opaque JPEG (white background)",
    make: () =>
      canvasFile(800, 500, "image/jpeg", "logo-on-white.jpg", (ctx) => {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, 800, 500);
        ctx.translate(150, 0);
        badge(ctx, 500);
      }),
  },
  { id: "renamed", label: "Text file renamed logo.png", make: async () => new File(["This is not an image.\n"], "logo.png", { type: "image/png" }) },
  { id: "oversized", label: "12 MB file named big.png", make: async () => new File([new Uint8Array(12 * 1024 * 1024)], "big.png", { type: "image/png" }) },
];
