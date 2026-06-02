/** Signed-in library landing route (`/app`). */
export const LIBRARY_HOME_PATH = "/app";

export function isLibraryHomePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === LIBRARY_HOME_PATH;
}
