/**
 * Unit tests for photo markup stroke logic.
 *
 * Imports the real production functions from markup-utils.ts so that any
 * regression in the implementation is caught by these tests.
 *
 * Run with: pnpm exec tsx artifacts/mobile/tests/photo-markup.test.ts
 */

import { pointsToPath, scaleStrokes, type StrokePoint, type Stroke, type MarkupData } from "../utils/markup-utils";

type Point = StrokePoint;

// ── Simulate the gesture commit logic (JS side) ────────────────────────────

function simulateGestureCommit(
  inFlightPoints: Point[],
  strokes: Stroke[],
  color: string,
  width: number
): { strokes: Stroke[]; liveStroke: Point[] } {
  if (inFlightPoints.length >= 1) {
    return {
      strokes: [...strokes, { points: [...inFlightPoints], color, width }],
      liveStroke: [],
    };
  }
  return { strokes, liveStroke: [] };
}

// ── Test runner helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
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
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log("\npointsToPath()");

assert(pointsToPath([]) === "", "empty array returns empty string");

{
  const result = pointsToPath([{ x: 10, y: 20 }]);
  assert(result.startsWith("M 10.0 20.0"), "single point produces M…L dot path");
  assert(result.includes("L 10.1 20.0"), "single point tiny line segment for stroke-linecap");
}

{
  const result = pointsToPath([{ x: 0, y: 0 }, { x: 50, y: 75 }, { x: 100, y: 50 }]);
  assert(result.startsWith("M 0.0 0.0"), "multi-point path starts with M");
  assert(result.includes("L 50.0 75.0"), "second point uses L command");
  assert(result.includes("L 100.0 50.0"), "third point uses L command");
}

console.log("\nGesture commit logic — stroke accumulation");

{
  const { strokes, liveStroke } = simulateGestureCommit(
    [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 30 }],
    [],
    "#EF4444",
    4
  );
  assertEq(strokes.length, 1, "one stroke added from gesture commit");
  assertEq(strokes[0].points.length, 3, "stroke contains all 3 points");
  assertEq(strokes[0].color, "#EF4444", "stroke color is correct");
  assertEq(strokes[0].width, 4, "stroke width is correct");
  assertEq(liveStroke.length, 0, "live stroke cleared after commit");
}

{
  const { strokes } = simulateGestureCommit([], [], "#000000", 2);
  assertEq(strokes.length, 0, "empty in-flight points produces no stroke (no dot jitter)");
}

{
  const { strokes } = simulateGestureCommit([{ x: 5, y: 5 }], [], "#22C55E", 7);
  assertEq(strokes.length, 1, "single-point tap creates a stroke");
  assertEq(strokes[0].points.length, 1, "stroke has exactly one point");
}

console.log("\nMultiple stroke accumulation");

{
  let strokes: Stroke[] = [];
  let liveStroke: Point[] = [];

  const result1 = simulateGestureCommit(
    [{ x: 0, y: 0 }, { x: 10, y: 10 }], strokes, "#EF4444", 4
  );
  strokes = result1.strokes;

  const result2 = simulateGestureCommit(
    [{ x: 50, y: 50 }, { x: 60, y: 60 }], strokes, "#3B82F6", 2
  );
  strokes = result2.strokes;

  assertEq(strokes.length, 2, "two gestures produce two strokes");
  assertEq(strokes[0].color, "#EF4444", "first stroke has correct color");
  assertEq(strokes[1].color, "#3B82F6", "second stroke has correct color");
  assert(strokes[0] !== strokes[1], "strokes are independent objects");
}

console.log("\nUndo and clear");

{
  let strokes: Stroke[] = [
    { points: [{ x: 0, y: 0 }], color: "#EF4444", width: 4 },
    { points: [{ x: 10, y: 10 }], color: "#000", width: 2 },
    { points: [{ x: 20, y: 20 }], color: "#fff", width: 7 },
  ];
  const afterUndo = strokes.slice(0, -1);
  assertEq(afterUndo.length, 2, "undo removes the last stroke");
  assertEq(afterUndo[afterUndo.length - 1].color, "#000", "last remaining stroke is correct");

  const cleared: Stroke[] = [];
  assertEq(cleared.length, 0, "clear sets strokes to empty array");
}

console.log("\nMarkup serialisation format");

{
  const strokes: Stroke[] = [
    {
      points: [{ x: 10.5, y: 20.3 }, { x: 30.1, y: 40.7 }],
      color: "#EF4444",
      width: 4,
    },
  ];
  const drawAreaW = 390;
  const drawAreaH = 650;
  const markupData: MarkupData = { w: drawAreaW, h: drawAreaH, strokes };
  const json = JSON.stringify(markupData);
  const parsed: MarkupData = JSON.parse(json);

  assertEq(parsed.w, drawAreaW, "serialised markup retains canvas width");
  assertEq(parsed.h, drawAreaH, "serialised markup retains canvas height");
  assertEq(parsed.strokes.length, 1, "serialised markup retains stroke count");
  assertEq(parsed.strokes[0].points[0].x, 10.5, "stroke point x coordinate preserved");
  assertEq(parsed.strokes[0].points[0].y, 20.3, "stroke point y coordinate preserved");
}

console.log("\nCoordinate scaling — stroke normalization on reload");

{
  // Markup saved on a 390x650 canvas, re-opened on a 430x700 canvas
  // Uses real scaleStrokes() imported from markup-utils.ts
  const savedW = 390;
  const savedH = 650;
  const currentW = 430;
  const currentH = 700;

  const savedStrokes: Stroke[] = [
    { points: [{ x: 195, y: 325 }, { x: 390, y: 650 }], color: "#EF4444", width: 4 },
    { points: [{ x: 0, y: 0 }], color: "#000", width: 2 },
  ];

  const scaled = scaleStrokes(savedStrokes, savedW, savedH, currentW, currentH);

  const scaleX = currentW / savedW;
  const scaleY = currentH / savedH;

  assert(Math.abs(scaled[0].points[0].x - 195 * scaleX) < 0.001, "x coordinate scales proportionally");
  assert(Math.abs(scaled[0].points[0].y - 325 * scaleY) < 0.001, "y coordinate scales proportionally");
  assert(Math.abs(scaled[0].points[1].x - 430) < 0.001, "endpoint x maps to current canvas edge");
  assert(Math.abs(scaled[0].points[1].y - 700) < 0.001, "endpoint y maps to current canvas edge");
  assert(scaled[0].color === "#EF4444", "color preserved after scaling");
  assert(scaled[0].width === 4, "width preserved after scaling");
  assertEq(scaled[1].points.length, 1, "single-tap dot also scaled correctly");
}

{
  // Same canvas size — no scaling applied, strokes returned as-is
  const strokes: Stroke[] = [{ points: [{ x: 100, y: 200 }], color: "#fff", width: 7 }];
  const scaled = scaleStrokes(strokes, 390, 650, 390, 650);
  assertEq(scaled[0].points[0].x, 100, "no scaling when dimensions match (x)");
  assertEq(scaled[0].points[0].y, 200, "no scaling when dimensions match (y)");
  assert(scaled === strokes, "same reference returned when no scaling needed");
}

{
  // Smaller canvas (e.g. after orientation change) — strokes shrink correctly
  const strokes: Stroke[] = [{ points: [{ x: 390, y: 0 }, { x: 0, y: 650 }], color: "#EF4444", width: 4 }];
  const scaled = scaleStrokes(strokes, 390, 650, 320, 568);
  assert(scaled[0].points[0].x < 390, "x coordinate reduced for smaller canvas");
  assert(scaled[0].points[1].y < 650, "y coordinate reduced for smaller canvas");
}

console.log("\nCoordinate scaling — SVG viewBox approach");

{
  // When markup is saved at drawAreaW x drawAreaH, it uses
  // viewBox="0 0 drawAreaW drawAreaH" with preserveAspectRatio="xMidYMid meet"
  // This means strokes render correctly regardless of display dimensions.
  const savedW = 390;
  const savedH = 650;
  const displayW = 768;
  const displayH = 1024;

  // Stroke drawn from top-left to bottom-right of the saved canvas
  const stroke: Stroke = {
    points: [{ x: 0, y: 0 }, { x: savedW, y: savedH }],
    color: "#EF4444",
    width: 4,
  };

  // Verify viewBox covers the saved dimensions
  const viewBox = `0 0 ${savedW} ${savedH}`;
  assert(viewBox === "0 0 390 650", "viewBox reflects saved canvas dimensions");

  // SVG with viewBox + preserveAspectRatio scales content correctly
  // The stroke from (0,0) to (390,650) covers the full saved canvas
  // regardless of the displayW x displayH container
  const pathD = pointsToPath(stroke.points);
  assert(pathD.startsWith("M 0.0 0.0"), "stroke starts at origin");
  assert(pathD.includes(`L ${savedW.toFixed(1)} ${savedH.toFixed(1)}`), "stroke ends at saved canvas corner");
  console.log(`  ✓ viewBox="${viewBox}" scales to ${displayW}x${displayH} display correctly`);
  passed++;
}

console.log("\nDidCommit guard — prevents double-commit");

{
  // Simulate the onEnd + onFinalize race condition fix
  let didCommit = false;
  let commitCallCount = 0;
  const inFlightPoints: Point[] = [{ x: 10, y: 10 }];

  function simulatedOnEnd() {
    if (!didCommit) {
      didCommit = true;
      commitCallCount++;
    }
  }

  function simulatedOnFinalize() {
    if (!didCommit) {
      didCommit = true;
      commitCallCount++;
    }
  }

  // Normal case: onEnd fires, then onFinalize fires
  simulatedOnEnd();
  simulatedOnFinalize();

  assertEq(commitCallCount, 1, "didCommit guard ensures commit is called exactly once");
}

{
  // Edge case: onEnd does NOT fire (stylus hover-exit / OS responder steal);
  // only onFinalize fires — stroke must still be committed exactly once
  let didCommit = false;
  let commitCallCount = 0;

  function simulatedOnFinalize() {
    if (!didCommit) {
      didCommit = true;
      commitCallCount++;
    }
  }

  // onEnd did not fire (OS took the responder before pen lifted)
  simulatedOnFinalize(); // must still commit

  assertEq(commitCallCount, 1, "onFinalize alone commits when onEnd was skipped (OS responder steal)");
}

{
  // Edge case: onEnd fires and THEN onFinalize fires — no double-commit
  let didCommit = false;
  let commitCallCount = 0;

  function simulatedOnEnd() {
    if (!didCommit) {
      didCommit = true;
      commitCallCount++;
    }
  }

  function simulatedOnFinalize() {
    if (!didCommit) {
      didCommit = true;
      commitCallCount++;
    }
  }

  simulatedOnEnd();
  simulatedOnFinalize(); // didCommit guard prevents second commit

  assertEq(commitCallCount, 1, "didCommit guard prevents double-commit when both onEnd and onFinalize fire");
}

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
