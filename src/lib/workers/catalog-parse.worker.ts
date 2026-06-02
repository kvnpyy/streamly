/**
 * Offloads multi‑MB live catalog JSON.parse from the main thread.
 * Keep this file dependency-free (no app imports).
 */

export type CatalogParseWorkerIn = { id: number; text: string };
export type CatalogParseWorkerOut =
  | { id: number; ok: true; data: unknown }
  | { id: number; ok: false; error: string };

self.onmessage = (ev: MessageEvent<CatalogParseWorkerIn>) => {
  const { id, text } = ev.data;
  try {
    const data = JSON.parse(text);
    const out: CatalogParseWorkerOut = { id, ok: true, data };
    self.postMessage(out);
  } catch (e) {
    const out: CatalogParseWorkerOut = {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
    self.postMessage(out);
  }
};
