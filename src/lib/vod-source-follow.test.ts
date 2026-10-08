import fsp from "fs/promises";
import os from "os";
import path from "path";
import { PassThrough } from "stream";
import { afterEach, describe, expect, it } from "vitest";
import { followGrowingFile, sourceCanStreamFromPipe } from "./vod-source-follow";

const dirs: string[] = [];

async function tempFile(): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "follow-"));
  dirs.push(dir);
  return path.join(dir, "src.partial");
}

function collect(out: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  out.on("data", (c: Buffer) => chunks.push(c));
  return new Promise((resolve) => out.on("end", () => resolve(Buffer.concat(chunks))));
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fsp.rm(d, { recursive: true, force: true })));
});

describe("sourceCanStreamFromPipe", () => {
  it("accepts front-to-back containers only", () => {
    expect(sourceCanStreamFromPipe("http://x/series/a/b/1358272.mkv")).toBe(true);
    expect(sourceCanStreamFromPipe("http://x/movie/a/b/9.ts?x=1")).toBe(true);
    expect(sourceCanStreamFromPipe("http://x/movie/a/b/9.mp4")).toBe(false);
    expect(sourceCanStreamFromPipe("http://x/movie/a/b/9")).toBe(false);
  });
});

describe("followGrowingFile", () => {
  it("waits at the end of a growing file and ends once the download is complete", async () => {
    const file = await tempFile();
    await fsp.writeFile(file, "aaaa");
    let complete = false;
    const out = new PassThrough();
    const got = collect(out);

    const run = followGrowingFile({
      filePath: file,
      out,
      state: async () => ({ complete, bytes: (await fsp.stat(file)).size }),
      waitForGrowth: () => new Promise((r) => setTimeout(r, 20)),
    });

    await new Promise((r) => setTimeout(r, 80));
    await fsp.appendFile(file, "bbbb");
    await new Promise((r) => setTimeout(r, 80));
    await fsp.appendFile(file, "cc");
    complete = true;

    const result = await run;
    expect(result.reason).toBe("complete");
    expect((await got).toString()).toBe("aaaabbbbcc");
  });

  it("gives up when the download stops growing", async () => {
    const file = await tempFile();
    await fsp.writeFile(file, "abc");
    const out = new PassThrough();
    const got = collect(out);

    const result = await followGrowingFile({
      filePath: file,
      out,
      state: async () => ({ complete: false, bytes: 3 }),
      waitForGrowth: () => new Promise((r) => setTimeout(r, 10)),
      stallMs: 50,
    });

    expect(result.reason).toBe("stalled");
    expect((await got).toString()).toBe("abc");
  });
});
