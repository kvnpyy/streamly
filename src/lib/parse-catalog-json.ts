import { yieldToMain } from "@/lib/yield-to-main";
import type { CatalogParseWorkerOut } from "@/lib/workers/catalog-parse.worker";

/** Payloads above this use a Web Worker when available. */
const WORKER_PARSE_MIN_BYTES = 384_000;

let worker: Worker | null = null;
let workerFailed = false;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function getParseWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(
      new URL("./workers/catalog-parse.worker.ts", import.meta.url)
    );
    worker.onmessage = (ev: MessageEvent<CatalogParseWorkerOut>) => {
      const msg = ev.data;
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.ok) {
        waiter.resolve(msg.data);
      } else {
        waiter.reject(new Error(msg.error || "Catalog parse failed"));
      }
    };
    worker.onerror = () => {
      workerFailed = true;
      worker?.terminate();
      worker = null;
      for (const [, w] of pending) {
        w.reject(new Error("Catalog parse worker failed"));
      }
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function parseInWorker(text: string): Promise<unknown> {
  const w = getParseWorker();
  if (!w) return parseOnMainThread(text);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, text });
  });
}

async function parseOnMainThread(text: string): Promise<unknown> {
  await yieldToMain();
  const data = JSON.parse(text);
  await yieldToMain();
  return data;
}

/** Parse live catalog JSON without blocking input for large playlists. */
export async function parseCatalogJson(text: string): Promise<unknown> {
  if (text.length >= WORKER_PARSE_MIN_BYTES) {
    return parseInWorker(text);
  }
  return parseOnMainThread(text);
}
