import { BrandMarkImage, BrandMarkOnCanvas } from "@/lib/brand-mark-image";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <BrandMarkOnCanvas>
        <BrandMarkImage size={28} radius={7} />
      </BrandMarkOnCanvas>
    ),
    { ...size }
  );
}
