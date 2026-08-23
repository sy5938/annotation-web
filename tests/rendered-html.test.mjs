import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the local basketball annotation workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>篮球视频标定台<\/title>/i);
  assert.match(html, /本地工作模式/);
  assert.match(html, /视频与标注不会上传/);
  assert.match(html, /打开本机视频/);
  assert.match(html, /导出标注 JSON/);
  assert.match(html, /class="workspace"/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps annotation controls local and the starter preview removed", async () => {
  const [component, css, page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/AnnotationClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<AnnotationClient \/>/);
  assert.match(component, /accept="video\/\*"/);
  assert.match(component, /new Blob\(\[content\], \{ type: "application\/json" \}\)/);
  assert.match(component, /URL\.createObjectURL\(file\)/);
  assert.match(layout, /title:\s*"篮球视频标定台"/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
