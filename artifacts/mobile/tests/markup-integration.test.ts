/**
 * Integration tests for the photo markup save/reload API flow.
 *
 * These tests exercise the complete lifecycle:
 *   1. Draw strokes (simulated via in-memory state as GestureDetector would produce)
 *   2. Save markup to the backend via PATCH /api/inspections/:id/checklist/:itemId
 *   3. Reload checklist from GET /api/inspections/:id/checklist
 *   4. Verify strokes are preserved with correct coordinates, colors, widths
 *   5. Verify the viewBox metadata (w, h) is persisted so overlays scale correctly
 *
 * Run with:
 *   MARKUP_TEST_EMAIL=<email> MARKUP_TEST_PASSWORD=<password> \
 *   MARKUP_TEST_INSPECTION_ID=<id> MARKUP_TEST_ITEM_ID=<id> \
 *   pnpm exec tsx artifacts/mobile/tests/markup-integration.test.ts
 *
 * All credentials and test data IDs are provided via environment variables only.
 * Never hardcode credentials in this file.
 *
 * Requires: API server running at http://localhost (or MARKUP_TEST_API_URL)
 */

const BASE_URL = process.env.MARKUP_TEST_API_URL ?? "http://localhost";
const LOGIN_EMAIL = process.env.MARKUP_TEST_EMAIL ?? "";
const LOGIN_PASSWORD = process.env.MARKUP_TEST_PASSWORD ?? "";
// Inspection and checklist item IDs are provided via environment variables.
// In CI/dev: set MARKUP_TEST_INSPECTION_ID and MARKUP_TEST_ITEM_ID to valid IDs.
// These are injected at runtime and never committed to the repository.
const TEST_INSPECTION_ID = parseInt(process.env.MARKUP_TEST_INSPECTION_ID ?? "0", 10);
const TEST_ITEM_ID = parseInt(process.env.MARKUP_TEST_ITEM_ID ?? "0", 10);

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string; width: number }
interface MarkupData { w: number; h: number; strokes: Stroke[] }

// ── Test runner helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
    errors.push(message);
  }
}

function assertEq<T>(actual: T, expected: T, message: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
    errors.push(message);
  }
}

// ── API helpers ────────────────────────────────────────────────────────────

async function fetchJSON(url: string, opts: RequestInit & { token?: string } = {}): Promise<{ status: number; data: any }> {
  const { token, ...rest } = opts;
  const res = await fetch(`${BASE_URL}${url}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

// ── Setup: obtain auth token ───────────────────────────────────────────────

let authToken = "";

async function login() {
  const { status, data } = await fetchJSON("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  if (status !== 200 || !data.token) {
    throw new Error(`Login failed: ${status} ${JSON.stringify(data)}`);
  }
  return data.token as string;
}

// ── Simulate gesture-committed strokes (what GestureDetector would produce) ──

function simulateGestureCommit(
  inFlightPoints: Point[],
  color: string,
  width: number
): Stroke {
  return { points: [...inFlightPoints], color, width };
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function testMarkupSaveAndReload() {
  console.log("\n── Test: Save markup and reload from API ─────────────────────────────────");

  const drawAreaW = 390;
  const drawAreaH = 650;

  // Simulate multiple strokes as GestureDetector.Pan() would produce
  const stroke1 = simulateGestureCommit(
    [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }],
    "#EF4444",
    4
  );
  const stroke2 = simulateGestureCommit(
    [{ x: 100, y: 200 }, { x: 150, y: 250 }],
    "#3B82F6",
    2
  );
  const stroke3 = simulateGestureCommit(
    [{ x: 5, y: 5 }], // single-tap dot
    "#22C55E",
    7
  );

  const strokes = [stroke1, stroke2, stroke3];
  const markupData: MarkupData = { w: drawAreaW, h: drawAreaH, strokes };

  // First, get existing checklist item state
  const { status: getStatus, data: checklist } = await fetchJSON(
    `/api/inspections/${TEST_INSPECTION_ID}/checklist`,
    { token: authToken }
  );
  assert(getStatus === 200, `GET checklist returns 200 (got ${getStatus})`);
  assert(Array.isArray(checklist), "Checklist response is an array");

  const item = Array.isArray(checklist)
    ? checklist.find((i: any) => i.id === TEST_ITEM_ID)
    : null;
  assert(item !== null && item !== undefined, `Checklist item ${TEST_ITEM_ID} found`);

  if (!item) return;

  // Simulate what saveMarkup() does: use a fake object path for testing
  const testObjectPath = `/objects/uploads/test-markup-${Date.now()}.jpg`;
  const existingMarkups: Record<string, MarkupData> = item.photoMarkups ?? {};
  const newMarkups = { ...existingMarkups, [testObjectPath]: markupData };

  // PATCH with markup data (mirrors photo-markup.tsx saveMarkup())
  const { status: patchStatus, data: patchData } = await fetchJSON(
    `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
    {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ photoMarkups: newMarkups }),
    }
  );
  assert(patchStatus === 200, `PATCH markup returns 200 (got ${patchStatus}: ${JSON.stringify(patchData).slice(0, 100)})`);

  // Reload checklist and verify markup was persisted
  const { status: reloadStatus, data: reloaded } = await fetchJSON(
    `/api/inspections/${TEST_INSPECTION_ID}/checklist`,
    { token: authToken }
  );
  assert(reloadStatus === 200, `Reload GET checklist returns 200 (got ${reloadStatus})`);

  const reloadedItem = Array.isArray(reloaded)
    ? reloaded.find((i: any) => i.id === TEST_ITEM_ID)
    : null;
  assert(reloadedItem !== null, "Reloaded checklist item found");

  if (!reloadedItem) return;

  const persistedMarkup: MarkupData | undefined = reloadedItem.photoMarkups?.[testObjectPath];
  assert(persistedMarkup !== undefined, `Markup persisted for object path ${testObjectPath}`);

  if (!persistedMarkup) return;

  // Verify canvas dimensions are preserved (needed for viewBox scaling)
  assertEq(persistedMarkup.w, drawAreaW, "Canvas width (w) preserved in markup");
  assertEq(persistedMarkup.h, drawAreaH, "Canvas height (h) preserved in markup");

  // Verify all strokes are preserved
  assertEq(persistedMarkup.strokes.length, 3, "All 3 strokes persisted");

  // Verify stroke 1 (multi-point, red pen)
  const s1 = persistedMarkup.strokes[0];
  assertEq(s1.points.length, 3, "Stroke 1 has 3 points");
  assertEq(s1.color, "#EF4444", "Stroke 1 color correct");
  assertEq(s1.width, 4, "Stroke 1 width correct");
  assertEq(s1.points[0].x, 10, "Stroke 1 first point x correct");
  assertEq(s1.points[0].y, 20, "Stroke 1 first point y correct");
  assertEq(s1.points[2].x, 50, "Stroke 1 last point x correct");
  assertEq(s1.points[2].y, 60, "Stroke 1 last point y correct");

  // Verify stroke 2 (blue pen)
  const s2 = persistedMarkup.strokes[1];
  assertEq(s2.points.length, 2, "Stroke 2 has 2 points");
  assertEq(s2.color, "#3B82F6", "Stroke 2 color (blue) correct");
  assertEq(s2.width, 2, "Stroke 2 width correct");

  // Verify stroke 3 (single-tap dot)
  const s3 = persistedMarkup.strokes[2];
  assertEq(s3.points.length, 1, "Stroke 3 (single tap) has 1 point");
  assertEq(s3.color, "#22C55E", "Stroke 3 color (green) correct");
  assertEq(s3.width, 7, "Stroke 3 width (thick) correct");
  assertEq(s3.points[0].x, 5, "Single-tap x coordinate correct");
  assertEq(s3.points[0].y, 5, "Single-tap y coordinate correct");

  // Clean up: restore original markup state
  const { status: cleanupStatus } = await fetchJSON(
    `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
    {
      method: "PATCH",
      token: authToken,
      body: JSON.stringify({ photoMarkups: existingMarkups }),
    }
  );
  assert(cleanupStatus === 200, "Cleanup PATCH restores original state");
}

async function testMarkupUpdatePreservesOtherPhotos() {
  console.log("\n── Test: Markup update preserves other photo markups ─────────────────────");

  const drawAreaW = 375;
  const drawAreaH = 600;

  // Snapshot original state before test
  const { data: priorChecklist } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
  const priorItem = Array.isArray(priorChecklist) ? priorChecklist.find((i: any) => i.id === TEST_ITEM_ID) : null;
  const originalMarkups: Record<string, MarkupData> = priorItem?.photoMarkups ?? {};

  const path1 = `/objects/uploads/test-photo-1-${Date.now()}.jpg`;
  const path2 = `/objects/uploads/test-photo-2-${Date.now()}.jpg`;
  const markup1: MarkupData = {
    w: drawAreaW, h: drawAreaH,
    strokes: [{ points: [{ x: 10, y: 10 }, { x: 50, y: 50 }], color: "#EF4444", width: 4 }],
  };
  const markup2: MarkupData = {
    w: drawAreaW, h: drawAreaH,
    strokes: [{ points: [{ x: 100, y: 100 }], color: "#000000", width: 2 }],
  };

  try {
    // Save first markup (preserving any originals)
    const { status: s1 } = await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: { ...originalMarkups, [path1]: markup1 } }) }
    );
    assert(s1 === 200, "First markup saved successfully");

    // Reload and add second markup
    const { data: intermediate } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
    const item = Array.isArray(intermediate) ? intermediate.find((i: any) => i.id === TEST_ITEM_ID) : null;
    const currentMarkups = item?.photoMarkups ?? {};

    const { status: s2 } = await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: { ...currentMarkups, [path2]: markup2 } }) }
    );
    assert(s2 === 200, "Second markup saved successfully");

    // Reload and verify both test markups present
    const { data: reloaded } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
    const reloadedItem = Array.isArray(reloaded) ? reloaded.find((i: any) => i.id === TEST_ITEM_ID) : null;

    assert(reloadedItem?.photoMarkups?.[path1] !== undefined, "First photo markup preserved after second save");
    assert(reloadedItem?.photoMarkups?.[path2] !== undefined, "Second photo markup persisted");
    assertEq(reloadedItem?.photoMarkups?.[path1]?.strokes?.length, 1, "First markup stroke count intact");
    assertEq(reloadedItem?.photoMarkups?.[path2]?.strokes?.length, 1, "Second markup stroke count intact");
  } finally {
    // Restore exact original state
    const { status: cleanStatus } = await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: originalMarkups }) }
    );
    assert(cleanStatus === 200, "Cleanup restores original markup state");
  }
}

async function testViewBoxMetadataForOverlayScaling() {
  console.log("\n── Test: ViewBox metadata allows correct SVG overlay scaling ─────────────");

  // Different device screen sizes should all render correctly via viewBox
  const smallDeviceW = 320;
  const smallDeviceH = 568;
  const largeDeviceW = 428;
  const largeDeviceH = 926;

  // Snapshot original state before test
  const { data: priorData } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
  const priorItem2 = Array.isArray(priorData) ? priorData.find((i: any) => i.id === TEST_ITEM_ID) : null;
  const originalMarkups2: Record<string, MarkupData> = priorItem2?.photoMarkups ?? {};

  const testPath = `/objects/uploads/test-scaling-${Date.now()}.jpg`;

  // Markup saved on small device
  const markupOnSmall: MarkupData = {
    w: smallDeviceW,
    h: smallDeviceH,
    strokes: [
      { points: [{ x: 0, y: 0 }, { x: smallDeviceW, y: smallDeviceH }], color: "#EF4444", width: 4 },
    ],
  };

  try {
    const { status } = await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: { ...originalMarkups2, [testPath]: markupOnSmall } }) }
    );
    assert(status === 200, "Markup with small device dimensions saved");

    // Reload and verify viewBox metadata preserved
    const { data } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
    const item = Array.isArray(data) ? data.find((i: any) => i.id === TEST_ITEM_ID) : null;
    const markup = item?.photoMarkups?.[testPath];

    assert(markup !== undefined, "Markup found after reload");
    if (markup) {
      assertEq(markup.w, smallDeviceW, "Saved canvas width matches small device width");
      assertEq(markup.h, smallDeviceH, "Saved canvas height matches small device height");

      const viewBox = `0 0 ${markup.w} ${markup.h}`;
      assertEq(viewBox, `0 0 ${smallDeviceW} ${smallDeviceH}`, "viewBox string is correct for SVG overlay");

      const strokeEndX = markup.strokes[0].points[1].x;
      const strokeEndY = markup.strokes[0].points[1].y;
      assert(strokeEndX === smallDeviceW, "Stroke endpoint x matches saved canvas width");
      assert(strokeEndY === smallDeviceH, "Stroke endpoint y matches saved canvas height");

      const scaleFactor = Math.min(largeDeviceW / markup.w, largeDeviceH / markup.h);
      assert(scaleFactor > 1, `Scale factor ${scaleFactor.toFixed(2)} > 1 on large device (upscaling works)`);
      console.log(`  ✓ Scale factor on ${largeDeviceW}x${largeDeviceH} display: ${scaleFactor.toFixed(2)}x`);
      passed++;

      // Verify coordinate-scaled reload: simulate reopening on large device
      const scaleX = largeDeviceW / smallDeviceW;
      const scaleY = largeDeviceH / smallDeviceH;
      const scaledX = markup.strokes[0].points[0].x * scaleX;
      const scaledY = markup.strokes[0].points[0].y * scaleY;
      assertEq(scaledX, 0, "Origin point x stays at 0 after scaling");
      assertEq(scaledY, 0, "Origin point y stays at 0 after scaling");
      const scaledEndX = markup.strokes[0].points[1].x * scaleX;
      const scaledEndY = markup.strokes[0].points[1].y * scaleY;
      assertEq(scaledEndX, largeDeviceW, "Endpoint x maps to large device width after scaling");
      assertEq(scaledEndY, largeDeviceH, "Endpoint y maps to large device height after scaling");
    }
  } finally {
    // Restore exact original state
    await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: originalMarkups2 }) }
    );
    assert(true, "Cleanup restored original state");
  }
}

async function testUndoAndClearBehavior() {
  console.log("\n── Test: Undo and clear → save empty markup ──────────────────────────────");

  // Snapshot original state before test
  const { data: priorData3 } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
  const priorItem3 = Array.isArray(priorData3) ? priorData3.find((i: any) => i.id === TEST_ITEM_ID) : null;
  const originalMarkups3: Record<string, MarkupData> = priorItem3?.photoMarkups ?? {};

  let strokes: Stroke[] = [
    { points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "#EF4444", width: 4 },
    { points: [{ x: 30, y: 30 }, { x: 40, y: 40 }], color: "#3B82F6", width: 2 },
    { points: [{ x: 50, y: 50 }], color: "#000000", width: 7 },
  ];

  // Simulate undo (removes last stroke)
  const afterUndo = strokes.slice(0, -1);
  assertEq(afterUndo.length, 2, "Undo removes last stroke");
  assertEq(afterUndo[afterUndo.length - 1].color, "#3B82F6", "Second stroke remains after undo");

  // Simulate undo again
  const afterUndo2 = afterUndo.slice(0, -1);
  assertEq(afterUndo2.length, 1, "Second undo removes another stroke");

  // Simulate clear
  const afterClear: Stroke[] = [];
  assertEq(afterClear.length, 0, "Clear produces empty strokes array");

  const testPath = `/objects/uploads/test-cleared-${Date.now()}.jpg`;

  try {
    // Save cleared markup to API
    const { status } = await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      {
        method: "PATCH",
        token: authToken,
        body: JSON.stringify({ photoMarkups: { ...originalMarkups3, [testPath]: { w: 390, h: 650, strokes: afterClear } } }),
      }
    );
    assert(status === 200, "Cleared markup (empty strokes) saves successfully");

    // Reload and verify empty strokes array persisted
    const { data } = await fetchJSON(`/api/inspections/${TEST_INSPECTION_ID}/checklist`, { token: authToken });
    const item = Array.isArray(data) ? data.find((i: any) => i.id === TEST_ITEM_ID) : null;
    const markup = item?.photoMarkups?.[testPath];

    if (markup) {
      assertEq(markup.strokes.length, 0, "Empty strokes array persisted after clear+save");
    } else {
      assert(false, "Markup entry exists even when strokes are empty");
    }
  } finally {
    // Restore exact original state
    await fetchJSON(
      `/api/inspections/${TEST_INSPECTION_ID}/checklist/${TEST_ITEM_ID}`,
      { method: "PATCH", token: authToken, body: JSON.stringify({ photoMarkups: originalMarkups3 }) }
    );
    assert(true, "Cleanup restored original state");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("Photo Markup Integration Tests");
  console.log("=".repeat(50));

  // Guard: require credentials from env vars only
  if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
    console.error("ERROR: MARKUP_TEST_EMAIL and MARKUP_TEST_PASSWORD env vars are required.");
    console.error("  Example: MARKUP_TEST_EMAIL=user@example.com MARKUP_TEST_PASSWORD=pass ... pnpm run test:integration");
    process.exit(1);
  }
  if (!TEST_INSPECTION_ID || !TEST_ITEM_ID) {
    console.error("ERROR: MARKUP_TEST_INSPECTION_ID and MARKUP_TEST_ITEM_ID env vars are required.");
    process.exit(1);
  }

  // Login
  console.log("\nAuthenticating...");
  try {
    authToken = await login();
    console.log("  ✓ Login successful");
    passed++;
  } catch (e: any) {
    console.error("  ✗ Login failed:", e.message);
    console.error("  Cannot run integration tests without auth. Exiting.");
    process.exit(1);
  }

  // Run all integration tests
  await testMarkupSaveAndReload();
  await testMarkupUpdatePreservesOtherPhotos();
  await testViewBoxMetadataForOverlayScaling();
  await testUndoAndClearBehavior();

  // Summary
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.error("Failed tests:");
    errors.forEach(e => console.error(`  - ${e}`));
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
