import { BrandMarkImage, BrandMarkOnCanvas } from "@/lib/brand-mark-image";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <BrandMarkOnCanvas background="linear-gradient(145deg, #06070b 0%, #11141c 100%)">
        <BrandMarkImage size={128} radius={32} />
      </BrandMarkOnCanvas>
    ),
    { ...size }
  );
}
