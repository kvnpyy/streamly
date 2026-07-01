/** True when the first bytes look like MP4/MOV or MPEG-TS (browser-friendly VOD). */
export function browserFriendlyVodSnippet(buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x47) return true;
  if (
    buf.length >= 8 &&
    String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!) === "ftyp"
  ) {
    return true;
  }
  return false;
}

export function looksLikeHtmlContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes("text/html") || ct.includes("application/xhtml");
}
