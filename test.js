#!/usr/bin/env node
/**
 * Compares solveGrouped() output against the ground-truth test files from
 * /Users/srihariganesh/Documents/solver24/tests/data/
 *
 * Does NOT modify the solver — only reports differences.
 */

const fs = require('fs');
const path = require('path');

// ── Test case metadata (mirrors conftest.py CASE_METADATA) ────────────────

const CASES = [
  { name: 'test1', numbers: [1, 1, 11, 11] },
  { name: 'test2', numbers: [3, 4, 8, 9] },
  { name: 'test3', numbers: [11, 13, 2, 2] },
  { name: 'test4', numbers: [3, 3, 8, 8] },
  { name: 'test5', numbers: [12, 12, 12, 13] },
  { name: 'test6', numbers: [4, 7, 8, 8] },
  { name: 'test7', numbers: [12, 12, 2, 2] },
];

const DATA_DIR = '/Users/srihariganesh/Documents/solver24/tests/data';

// ── Test file parser (mirrors conftest.py _parse_solution_file) ───────────
//
// Returns: tree = [ identityGroup, ... ]
// identityGroup = [ subgroup, ... ]
// subgroup = [ expr, ... ]

function parseTestFile(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n');
  const tree = [];
  let currentFirst = null;
  let currentSecond = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('@@')) {
      currentSecond = [];
      currentFirst.push(currentSecond);
    } else if (line.startsWith('@')) {
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
  const canon = tree.map(idGroup => {
    const subgroups = idGroup.map(sg => [...sg].sort());
    subgroups.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return subgroups;
  });
  canon.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return canon;
}

// ── Solver (copy of the logic in index.html <script>) ─────────────────────

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = b; b = a % b; a = t; } return a || 1; }
function frac(n, d) { if (d === 0) return null; if (d < 0) { n = -n; d = -d; } const g = gcd(Math.abs(n), d); return { n: n / g, d: d / g }; }
function applyOp(op, a, b) { switch (op) { case '+': return frac(a.n * b.d + b.n * a.d, a.d * b.d); case '-': return frac(a.n * b.d - b.n * a.d, a.d * b.d); case '*': return frac(a.n * b.n, a.d * b.d); case '/': return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n); default: return null; } }
const OPS = ['+', '-', '*', '/'];
function isOp(t) { return typeof t === 'string'; }
function isValidRPN(tokens) { let depth = 0; for (const t of tokens) { if (isOp(t)) { if (depth < 2) return false; depth--; } else depth++; } return depth === 1; }
function evaluateRPN(tokens) { const stack = []; for (const t of tokens) { if (isOp(t)) { if (stack.length < 2) return null; const right = stack.pop(), left = stack.pop(); const res = applyOp(t, left, right); if (!res) return null; stack.push(res); } else { stack.push(t); } } return stack.length === 1 ? stack[0] : null; }
function rpnToInfix(tokens) { const stack = []; for (const t of tokens) { if (isOp(t)) { const right = stack.pop(), left = stack.pop(); stack.push(`(${left} ${t} ${right})`); } else { stack.push(t.d === 1 ? String(t.n) : `${t.n}/${t.d}`); } } return stack[0]; }
function* permutations(arr) { if (arr.length <= 1) { yield arr.slice(); return; } for (let i = 0; i < arr.length; i++) { const rest = arr.filter((_, j) => j !== i); for (const p of permutations(rest)) yield [arr[i], ...p]; } }
function* opTriples() { for (const a of OPS) for (const b of OPS) for (const c of OPS) yield [a, b, c]; }
function tokensToTree(tokens) { const stack = []; for (const t of tokens) { if (isOp(t)) { const right = stack.pop(), left = stack.pop(); stack.push({ isLeaf: false, op: t, left, right }); } else { stack.push({ isLeaf: true, value: t }); } } return stack[0]; }
function keyStr(k) { return JSON.stringify(k); }
function intPow(base, exp) { return (base === 1 || exp % 2 === 0) ? 1 : -1; }
function flattenAdd(node, sign, out) { if (node.isLeaf || (node.op !== '+' && node.op !== '-')) { out.push([sign, node]); return; } flattenAdd(node.left, sign, out); flattenAdd(node.right, node.op === '+' ? sign : -sign, out); }
function flattenMul(node, exp, out) { if (node.isLeaf || (node.op !== '*' && node.op !== '/')) { out.push([exp, node]); return; } flattenMul(node.left, exp, out); flattenMul(node.right, node.op === '*' ? exp : -exp, out); }
function canonicalSymbolic(node) { if (node.isLeaf) { const { n, d } = node.value; return [n < 0 ? -1 : 1, ['val', Math.abs(n), d]]; } if (node.op === '+' || node.op === '-') { const terms = []; flattenAdd(node, 1, terms); const cm = new Map(); for (const [ts, child] of terms) { const [cs, ck] = canonicalSymbolic(child); const ks = keyStr(ck); if (cm.has(ks)) cm.get(ks)[1] += ts * cs; else cm.set(ks, [ck, ts * cs]); } let items = [...cm.values()].filter(([, c]) => c !== 0); if (!items.length) return [1, ['val', 0, 1]]; items.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); let sign = 1; if (items[0][1] < 0) { items = items.map(([k, c]) => [k, -c]); sign = -1; } return [sign, ['add', items]]; } if (node.op === '*' || node.op === '/') { const factors = []; flattenMul(node, 1, factors); const em = new Map(); let sign = 1; for (const [power, child] of factors) { const [cs, ck] = canonicalSymbolic(child); sign *= cs; const ks = keyStr(ck); if (em.has(ks)) em.get(ks)[1] += power; else em.set(ks, [ck, power]); } const num = [], den = []; for (const [k, e] of em.values()) { if (e > 0) num.push([k, e]); else if (e < 0) den.push([k, -e]); } num.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); den.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); if (!num.length && !den.length) return [sign, ['val', 1, 1]]; return [sign, ['mul', num, den]]; } }
function symbolicKeyToIdentityKey([overallSign, key]) { function valueOf(node) { if (!node) return null; if (node[0] === 'val') return { n: node[1], d: node[2] }; if (node[0] === 'add') { let rn = 0, rd = 1; for (const [sub, mult] of node[1]) { const v = valueOf(sub); if (!v) return null; rn = rn * v.d + mult * v.n * rd; rd = rd * v.d; const g = gcd(Math.abs(rn), rd); rn /= g; rd /= g; } if (rd < 0) { rn = -rn; rd = -rd; } return { n: rn, d: rd }; } if (node[0] === 'mul') { const [numT, denT] = [node[1] || [], node[2] || []]; let rn = 1, rd = 1; for (const [sub, exp] of numT) { const v = valueOf(sub); if (!v) return null; if (v.n === 0) return { n: 0, d: 1 }; rn *= Math.pow(v.n, exp); rd *= Math.pow(v.d, exp); } for (const [sub, exp] of denT) { const v = valueOf(sub); if (!v || v.n === 0) return null; rn *= Math.pow(v.d, exp); rd *= Math.pow(v.n, exp); } if (rd < 0) { rn = -rn; rd = -rd; } const g = gcd(Math.abs(rn), Math.abs(rd)); return { n: rn / g, d: rd / g }; } return null; } function feq(v, n, d) { return v && v.n === n && v.d === d; } function simplify(node) { if (!node) return [1, null]; if (node[0] === 'val') return [1, node]; if (node[0] === 'add') { const cm = new Map(); for (const [term, mult] of node[1]) { const [cs, s] = simplify(term); if (!s) continue; const coeff = mult * cs; const sv = valueOf(s); if (feq(sv, 0, 1)) continue; const ks = keyStr(s); if (cm.has(ks)) cm.get(ks)[1] += coeff; else cm.set(ks, [s, coeff]); } let items = [...cm.values()].filter(([, c]) => c !== 0); if (!items.length) return [1, ['val', 0, 1]]; items.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); let sign = 1; if (items[0][1] < 0) { items = items.map(([k, c]) => [k, -c]); sign = -1; } if (items.length === 1 && items[0][1] === 1) return [sign, items[0][0]]; return [sign, ['add', items]]; } if (node[0] === 'mul') { const [numT, denT] = [node[1] || [], node[2] || []]; let sign = 1; const em = new Map(); let zero = false; function handle(termList, dir) { for (const [child, power] of termList) { const [cs, s] = simplify(child); if (!s) continue; sign *= intPow(cs, power); const sv = valueOf(s); if (sv !== null) { if (feq(sv, 0, 1)) { zero = true; return; } if (feq(sv, 1, 1)) continue; if (feq(sv, -1, 1)) { sign *= intPow(-1, power); continue; } } const exp = dir * power; const ks = keyStr(s); if (em.has(ks)) em.get(ks)[1] += exp; else em.set(ks, [s, exp]); } } handle(numT, 1); if (zero) return [1, ['val', 0, 1]]; handle(denT, -1); if (zero) return [1, ['val', 0, 1]]; const num = [], den = []; for (const [k, e] of em.values()) { if (e > 0) num.push([k, e]); else if (e < 0) den.push([k, -e]); } num.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); den.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0]))); if (!num.length && !den.length) return [sign, ['val', 1, 1]]; if (!den.length && num.length === 1 && num[0][1] === 1) return [sign, num[0][0]]; if (!num.length && den.length === 1 && den[0][1] === 1) return [sign, ['mul', [], den]]; return [sign, ['mul', num, den]]; } } const [exprSign, simplified] = simplify(key); const final = simplified || ['val', 0, 1]; if (keyStr(final) === keyStr(['val', 0, 1])) return [1, final]; return [overallSign * exprSign < 0 ? -1 : 1, final]; }

function solveGrouped(numbers) {
  const nums = numbers.map(n => frac(n, 1));
  const unique = new Map();
  for (const ops of opTriples()) {
    const combined = [...nums, ...ops];
    for (const perm of permutations(combined)) {
      if (!isValidRPN(perm)) continue;
      const result = evaluateRPN(perm);
      if (!result || result.n !== 24 || result.d !== 1) continue;
      const infix = rpnToInfix(perm);
      if (!unique.has(infix)) unique.set(infix, perm);
    }
  }
  const symGroups = new Map();
  for (const [infix, tokens] of unique) {
    const symKey = canonicalSymbolic(tokensToTree(tokens));
    const ks = keyStr(symKey);
    if (!symGroups.has(ks)) symGroups.set(ks, { key: symKey, infixes: [] });
    symGroups.get(ks).infixes.push(infix);
  }
  const idGroups = new Map();
  for (const { key, infixes } of symGroups.values()) {
    const idKey = symbolicKeyToIdentityKey(key);
    const iks = keyStr(idKey);
    if (!idGroups.has(iks)) idGroups.set(iks, []);
    idGroups.get(iks).push({ infixes: infixes.sort() });
  }
  return [...idGroups.values()].map(subgroups => ({
    total: subgroups.reduce((s, sg) => s + sg.infixes.length, 0),
    subgroups,
  }));
}

// ── Convert solveGrouped output to the same tree shape as parsed test files ─

function groupedToTree(groups) {
  // groups: [{total, subgroups: [{infixes}]}]
  // tree:   [[[expr,...], [expr,...]], ...]
  return groups.map(g => g.subgroups.map(sg => sg.infixes));
}

// ── Diff helpers ───────────────────────────────────────────────────────────

function setDiff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return {
    onlyInA: [...sa].filter(x => !sb.has(x)),
    onlyInB: [...sb].filter(x => !sa.has(x)),
  };
}

function flatExprs(tree) {
  return tree.flat(2);
}

// ── Run tests ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

for (const { name, numbers } of CASES) {
  const filepath = path.join(DATA_DIR, `${name}.txt`);
  const expectedTree = parseTestFile(filepath);
  const actualTree   = groupedToTree(solveGrouped(numbers));

  const canonExpected = canonicalizeTree(expectedTree);
  const canonActual   = canonicalizeTree(actualTree);

  const match = JSON.stringify(canonExpected) === JSON.stringify(canonActual);

  if (match) {
    console.log(`✓  ${name}  (${numbers.join(',')})  — ${flatExprs(actualTree).length} exprs, ${actualTree.length} ideas`);
    passed++;
  } else {
    console.log(`✗  ${name}  (${numbers.join(',')})  — FAIL`);
    failed++;

    // Report expression-level diff
    const expFlat = flatExprs(expectedTree).sort();
    const actFlat = flatExprs(actualTree).sort();
    const { onlyInA: missingFromActual, onlyInB: extraInActual } = setDiff(expFlat, actFlat);

    if (missingFromActual.length) {
      console.log(`   Missing expressions (${missingFromActual.length}):`);
      missingFromActual.slice(0, 5).forEach(e => console.log(`     - ${e}`));
      if (missingFromActual.length > 5) console.log(`     ... and ${missingFromActual.length - 5} more`);
    }
    if (extraInActual.length) {
      console.log(`   Extra expressions (${extraInActual.length}):`);
      extraInActual.slice(0, 5).forEach(e => console.log(`     + ${e}`));
      if (extraInActual.length > 5) console.log(`     ... and ${extraInActual.length - 5} more`);
    }

    // If expressions match but grouping differs, say so
    if (!missingFromActual.length && !extraInActual.length) {
      console.log(`   Expressions match but GROUPING differs.`);

      // Show expected vs actual group structure
      console.log(`   Expected: ${canonExpected.length} ideas`);
      canonExpected.forEach((ig, i) => {
        const total = ig.reduce((s, sg) => s + sg.length, 0);
        console.log(`     idea ${i+1}: ${ig.length} subgroup(s), ${total} exprs  [${ig[0][0]}]`);
      });
      console.log(`   Actual:   ${canonActual.length} ideas`);
      canonActual.forEach((ig, i) => {
        const total = ig.reduce((s, sg) => s + sg.length, 0);
        console.log(`     idea ${i+1}: ${ig.length} subgroup(s), ${total} exprs  [${ig[0][0]}]`);
      });
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
