import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the latest resume experience in newest-first order", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const expectedEntries = [
    ["Amazon Web Services (AWS)", "Aug 2026 — Present"],
    ["American Family Insurance", "Jun 2026 — Aug 2026"],
    ["Zhan Lab · Purdue University", "May 2025 — May 2026"],
    ["Suga International Holdings Limited", "Jun 2025 — Aug 2025"],
  ];

  const positions = expectedEntries.map(([company, period]) => {
    assert.match(html, new RegExp(company.replace(/[()]/g, "\\$&")));
    assert.match(html, new RegExp(period));
    return html.indexOf(company);
  });

  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.match(html, /containerized platform \(Docker, AWS ECS on Fargate\)/);
});
