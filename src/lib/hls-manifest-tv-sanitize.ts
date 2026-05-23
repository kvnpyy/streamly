/**
 * Strip master-playlist variants that Fire TV / Chromium TV browsers usually cannot
 * play via MSE (HEVC, Dolby Digital / Digital Plus in CODECS) when at least one
 * safer variant remains. No-op for media playlists or single-variant masters.
 */

export type MasterParts = {
  header: string[];
  variants: Array<{ inf: string; uri: string }>;
  footer: string[];
};

export function parseMasterPlaylistLines(lines: string[]): MasterParts {
  const header: string[] = [];
  const variants: MasterParts["variants"] = [];
  const footer: string[] = [];
  let i = 0;
  while (i < lines.length && !lines[i].startsWith("#EXT-X-STREAM-INF")) {
    header.push(lines[i]);
    i++;
  }
  while (i < lines.length) {
    const inf = lines[i];
    if (!inf.startsWith("#EXT-X-STREAM-INF")) break;
    const uri = lines[i + 1];
    if (!uri || uri.startsWith("#")) break;
    variants.push({ inf, uri });
    i += 2;
  }
  while (i < lines.length) {
    footer.push(lines[i]);
    i++;
  }
  return { header, variants, footer };
}

export function codecsFromStreamInf(streamInfLine: string): string {
  const m = /CODECS="([^"]*)"/i.exec(streamInfLine);
  return (m?.[1] ?? "").trim();
}

export function codecsLooksHevc(codecs: string): boolean {
  const c = codecs.toLowerCase();
  return (
    c.includes("hvc1") ||
    c.includes("hev1") ||
    c.includes("hev.") ||
    c.includes("hevc") ||
    c.includes("h265") ||
    c.includes("dvhe") ||
    c.includes("dvh1")
  );
}

export function codecsLooksDolbyDigital(codecs: string): boolean {
  const c = codecs.toLowerCase().replace(/\s+/g, "");
  return (
    c.includes("ac-3") ||
    c.includes("ac3") ||
    c.includes("ec-3") ||
    c.includes("ec3") ||
    c.includes("eac3") ||
    c.includes("e-ac-3")
  );
}

export function rebuildMasterPlaylist(parts: MasterParts): string {
  const out: string[] = [...parts.header];
  for (const v of parts.variants) {
    out.push(v.inf, v.uri);
  }
  out.push(...parts.footer);
  return out.join("\n");
}

/** @returns original body if unchanged or not a multi-variant master we can safely adjust */
export function sanitizeTvMasterPlaylistIfNeeded(manifestBody: string): string {
  if (!manifestBody.includes("#EXT-X-STREAM-INF")) {
    return manifestBody;
  }
  const lines = manifestBody.split(/\r?\n/);
  const parts = parseMasterPlaylistLines(lines);
  const { variants } = parts;
  if (variants.length <= 1) {
    return manifestBody;
  }

  const codecsList = variants.map((v) => codecsFromStreamInf(v.inf));
  const unknownAll = codecsList.every((c) => !c);
  if (unknownAll) {
    return manifestBody;
  }

  let working = variants;
  let codecs = working.map((v) => codecsFromStreamInf(v.inf));

  const stripHevc =
    codecs.some((c) => c && !codecsLooksHevc(c)) &&
    codecs.some((c) => c && codecsLooksHevc(c));
  if (stripHevc) {
    working = working.filter((_, i) => !codecs[i] || !codecsLooksHevc(codecs[i]));
    codecs = working.map((v) => codecsFromStreamInf(v.inf));
  }

  const stripDolby =
    codecs.some((c) => c && !codecsLooksDolbyDigital(c)) &&
    codecs.some((c) => c && codecsLooksDolbyDigital(c));
  if (stripDolby) {
    working = working.filter(
      (_, i) => !codecs[i] || !codecsLooksDolbyDigital(codecs[i])
    );
  }

  if (working.length === 0 || working.length === variants.length) {
    return manifestBody;
  }

  return rebuildMasterPlaylist({ ...parts, variants: working });
}
