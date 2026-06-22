import { BrandMarkImage, BrandMarkOnCanvas } from "@/lib/brand-mark-image";
import { ImageResponse } from "next/og";

export const runtime = "edge";

const ALLOWED = new Set([128, 192, 256, 384, 512]);

function parseSize(raw: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 192;
  if (ALLOWED.has(n)) return n;
  if (n >= 400) return 512;
  if (n >= 160) return 192;
  return 128;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ size: string }> }
) {
  const { size: sizeRaw } = await ctx.params;
  const size = parseSize(sizeRaw);
  const mark = Math.round(size * 0.72);
  const radius = Math.round(size * 0.18);

  return new ImageResponse(
    (
      <BrandMarkOnCanvas background="linear-gradient(145deg, #06070b 0%, #11141c 100%)">
        <BrandMarkImage size={mark} radius={radius} />
      </BrandMarkOnCanvas>
    ),
    { width: size, height: size }
  );
}
