/**
 * Read an XHR body as text without throwing when hls.js (or similar) sets
 * `responseType` to `"arraybuffer"`. Accessing `responseText` in that state
 * raises InvalidStateError in browsers.
 */
export function readXhrBodyAsText(xhr: XMLHttpRequest): string {
  const rt = xhr.responseType;
  if (rt === "" || rt === "text") {
    return (xhr.responseText ?? "").trim();
  }
  if (rt === "arraybuffer") {
    const buf = xhr.response;
    if (!(buf instanceof ArrayBuffer)) return "";
    try {
      return new TextDecoder().decode(buf).trim();
    } catch {
      return "";
    }
  }
  if (typeof xhr.response === "string") {
    return xhr.response.trim();
  }
  return "";
}
