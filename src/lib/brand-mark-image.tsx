import type { CSSProperties, ReactNode } from "react";

/** Shared Streamly mark for `next/og` ImageResponse (favicon, apple-touch, OG). */
export function BrandMarkImage({
  size,
  radius,
}: {
  size: number;
  radius: number;
}) {
  const playW = Math.round(size * 0.34);
  const playH = Math.round(size * 0.38);
  const echoW = Math.round(size * 0.12);

  const tile: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    background: "linear-gradient(135deg, #8a6dff 0%, #7c5cff 42%, #00e0c6 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 32px rgba(124,92,255,0.45)",
    position: "relative",
  };

  return (
    <div style={tile}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginLeft: Math.round(size * 0.04),
        }}
      >
        <div
          style={{
            width: echoW,
            height: playH,
            borderRadius: 2,
            background: "rgba(255,255,255,0.35)",
            marginRight: Math.round(size * 0.04),
          }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderTop: `${playH / 2}px solid transparent`,
            borderBottom: `${playH / 2}px solid transparent`,
            borderLeft: `${playW}px solid white`,
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
          }}
        />
      </div>
    </div>
  );
}

export function BrandMarkOnCanvas({
  children,
  background = "#06070b",
}: {
  children: ReactNode;
  background?: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
      }}
    >
      {children}
    </div>
  );
}
