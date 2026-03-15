#!/usr/bin/env node
/**
 * Compares solveGrouped() output against the ground-truth test files from
 * /Users/srihariganesh/Documents/solver24/tests/data/
 *
 * Does NOT modify the solver — only reports differences.
 */

const fs = require("fs");
const path = require("path");
const { solveGrouped, rpnToInfix, frac } = require("./solver");

// ── Test case metadata (mirrors conftest.py CASE_METADATA) ────────────────

const CASES = [
  { name: "test1", numbers: [1, 1, 11, 11] },
  { name: "test2", numbers: [3, 4, 8, 9] },
  { name: "test3", numbers: [11, 13, 2, 2] },
  { name: "test4", numbers: [3, 3, 8, 8] },
  { name: "test5", numbers: [12, 12, 12, 13] },
  { name: "test6", numbers: [4, 7, 8, 8] },
  { name: "test7", numbers: [12, 12, 2, 2] },
];

const DATA_DIR = path.join(__dirname, "testdata");

// ── Test file parser (mirrors conftest.py _parse_solution_file) ───────────
//
// Returns: tree = [ identityGroup, ... ]
// identityGroup = [ subgroup, ... ]
// subgroup = [ expr, ... ]

function parseTestFile(filepath) {
  const lines = fs.readFileSync(filepath, "utf8").split("\n");
  const tree = [];
  let currentFirst = null;
  let currentSecond = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("@@")) {
      currentSecond = [];
      currentFirst.push(currentSecond);
    } else if (line.startsWith("@")) {
      currentFirst = [];
      tree.push(currentFirst);
      currentSecond = null;
    } else {
      // expression
      if (currentSecond !== null) {
        currentSecond.push(line);
      } else {
        currentSecond = [line];
        currentFirst.push(currentSecond);
      }
    }
  }
  return tree;
}

// ── Canonicalization (mirrors conftest.py _canonicalize_tree) ─────────────
//
// Sort expressions within each subgroup, sort subgroups within each identity
// group, sort identity groups — then JSON.stringify for comparison.

function canonicalizeTree(tree) {
  const canon = tree.map((idGroup) => {
    const subgroups = idGroup.map((sg) => [...sg].sort());
    subgroups.sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
    return subgroups;
  });
  canon.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return canon;
}

// ── Convert solveGrouped output to the same tree shape as parsed test files ─

function groupedToTree(groups) {
  // groups: [{total, subgroups: [{infixes}]}]
  // tree:   [[[expr,...], [expr,...]], ...]
  return groups.map((g) => g.subgroups.map((sg) => sg.infixes));
}

// ── Diff helpers ───────────────────────────────────────────────────────────

function setDiff(a, b) {
  const sa = new Set(a),
    sb = new Set(b);
  return {
    onlyInA: [...sa].filter((x) => !sb.has(x)),
    onlyInB: [...sb].filter((x) => !sa.has(x)),
  };
}

function flatExprs(tree) {
  return tree.flat(2);
}

// ── Run tests ──────────────────────────────────────────────────────────────

let passed = 0,
  failed = 0;

for (const { name, numbers } of CASES) {
  const filepath = path.join(DATA_DIR, `${name}.txt`);
  let expectedTree;
  try {
    expectedTree = parseTestFile(filepath);
  } catch (e) {
    console.log(
      `✗  ${name}  (${numbers.join(",")})  — could not read ${filepath}: ${e.message}`,
    );
    failed++;
    continue;
  }

  const nums = numbers.map((n) => frac(n, 1));
  const actualTree = groupedToTree(
    solveGrouped(nums, { n: 24, d: 1 }, "exact", "all", rpnToInfix),
  );

  const canonExpected = canonicalizeTree(expectedTree);
  const canonActual = canonicalizeTree(actualTree);

  const match = JSON.stringify(canonExpected) === JSON.stringify(canonActual);

  if (match) {
    console.log(
      `✓  ${name}  (${numbers.join(",")})  — ${flatExprs(actualTree).length} exprs, ${actualTree.length} ideas`,
    );
    passed++;
  } else {
    console.log(`✗  ${name}  (${numbers.join(",")})  — FAIL`);
    failed++;

    // Report expression-level diff
    const expFlat = flatExprs(expectedTree).sort();
    const actFlat = flatExprs(actualTree).sort();
    const { onlyInA: missingFromActual, onlyInB: extraInActual } = setDiff(
      expFlat,
      actFlat,
    );

    if (missingFromActual.length) {
      console.log(`   Missing expressions (${missingFromActual.length}):`);
      missingFromActual.slice(0, 5).forEach((e) => console.log(`     - ${e}`));
      if (missingFromActual.length > 5)
        console.log(`     ... and ${missingFromActual.length - 5} more`);
    }
    if (extraInActual.length) {
      console.log(`   Extra expressions (${extraInActual.length}):`);
      extraInActual.slice(0, 5).forEach((e) => console.log(`     + ${e}`));
      if (extraInActual.length > 5)
        console.log(`     ... and ${extraInActual.length - 5} more`);
    }

    // If expressions match but grouping differs, say so
    if (!missingFromActual.length && !extraInActual.length) {
      console.log(`   Expressions match but GROUPING differs.`);

      // Show expected vs actual group structure
      console.log(`   Expected: ${canonExpected.length} ideas`);
      canonExpected.forEach((ig, i) => {
        const total = ig.reduce((s, sg) => s + sg.length, 0);
        console.log(
          `     idea ${i + 1}: ${ig.length} subgroup(s), ${total} exprs  [${ig[0][0]}]`,
        );
      });
      console.log(`   Actual:   ${canonActual.length} ideas`);
      canonActual.forEach((ig, i) => {
        const total = ig.reduce((s, sg) => s + sg.length, 0);
        console.log(
          `     idea ${i + 1}: ${ig.length} subgroup(s), ${total} exprs  [${ig[0][0]}]`,
        );
      });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
