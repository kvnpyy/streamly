/** Client-visible release label (`NEXT_PUBLIC_APP_VERSION` from package.json at build). */
export function getAppVersionLabel(): string {
  const v =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_VERSION?.trim()
      : "";
  return v ? `v${v.replace(/^v/i, "")}` : "vdev";
}
