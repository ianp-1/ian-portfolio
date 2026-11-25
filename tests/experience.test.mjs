import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("renders the latest resume experience, ordering, and stack", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const expectedEntries = [
    ["Amazon Web Services (AWS)", "Sep 2026 — Present"],
    ["American Family Insurance", "Jun 2026 — Aug 2026"],
    ["Zhan Lab · Purdue University", "May 2025 — May 2026"],
    ["FedEx · The Data Mine at Purdue", "Aug 2025 — Dec 2025"],
    ["Suga International Holdings Limited", "Jun 2025 — Aug 2025"],
    ["Suga International Holdings", "Jun 2024 — Aug 2024"],
  ];

  const positions = expectedEntries.map(([company, period]) => {
    const escCompany = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(html, new RegExp(`>\\s*${escCompany}\\s*</p>`));
    assert.match(html, new RegExp(period.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return html.indexOf(period);
  });

  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

  // New AWS SDE Intern highlights & role
  assert.match(html, />\s*Software Development Engineer Intern\s*<\/h3>/);
  assert.match(html, /local caching layer in C\+\+/);
  assert.match(html, /in-memory LRU caching layer/);
  assert.match(html, /A\/B benchmarking framework in Go/);

  // Updated FedEx highlight
  assert.match(html, /FedEx Indianapolis hub, managing volume from 64 flights and 195 trucks/);

  // Existing web highlights retained
  assert.match(html, /containerized platform \(Docker, AWS ECS on Fargate\)/);
  assert.match(html, /Standardized Datadog observability across 20\+ gateway endpoints/);

  // Updated Stack items
  for (const skill of ["Go", "AWS", "Kubernetes"]) {
    assert.match(html, new RegExp(`>\\s*${skill}\\s*</li>`));
  }

  // Stale text removed
  assert.doesNotMatch(html, /Incoming Software Engineer Intern/);
  assert.doesNotMatch(html, /Aug 2025 — Present/);
});
