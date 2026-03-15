// ── Rational arithmetic ────────────────────────────────────────────────

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

function frac(n, d) {
  if (d === 0) return null;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(Math.abs(n), d);
  return { n: n / g, d: d / g };
}

function applyOp(op, a, b) {
  switch (op) {
    case "+":
      return frac(a.n * b.d + b.n * a.d, a.d * b.d);
    case "-":
      return frac(a.n * b.d - b.n * a.d, a.d * b.d);
    case "*":
      return frac(a.n * b.n, a.d * b.d);
    case "/":
      return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n);
    default:
      return null;
  }
}

// ── RPN helpers ────────────────────────────────────────────────────────

const OPS = ["+", "-", "*", "/"];

function isOp(t) {
  return typeof t === "string";
}

function isValidRPN(tokens) {
  let depth = 0;
  for (const t of tokens) {
    if (isOp(t)) {
      if (depth < 2) return false;
      depth--;
    } else depth++;
  }
  return depth === 1;
}

function evaluateRPN(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (isOp(t)) {
      if (stack.length < 2) return null;
      const right = stack.pop(),
        left = stack.pop();
      const res = applyOp(t, left, right);
      if (!res) return null;
      stack.push(res);
    } else {
      stack.push(t);
    }
  }
  return stack.length === 1 ? stack[0] : null;
}

function rpnToInfix(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (isOp(t)) {
      const right = stack.pop(),
        left = stack.pop();
      stack.push(`(${left} ${t} ${right})`);
    } else {
      stack.push(t.d === 1 ? String(t.n) : `${t.n}/${t.d}`);
    }
  }
  return stack[0];
}

// Minimal-parens infix for display — only parenthesizes where operator
// precedence actually requires it.
function toDisplayInfix(tokens) {
  const PREC = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const stack = []; // [{ str, op }]
  for (const t of tokens) {
    if (isOp(t)) {
      const right = stack.pop(),
        left = stack.pop();
      const p = PREC[t];
      const leftStr =
        left.op !== null && PREC[left.op] < p ? `(${left.str})` : left.str;
      const rightStr =
        right.op !== null &&
        (t === "-" || t === "/" ? PREC[right.op] <= p : PREC[right.op] < p)
          ? `(${right.str})`
          : right.str;
      const opStr = t === "-" ? "−" : t;
      stack.push({ str: `${leftStr} ${opStr} ${rightStr}`, op: t });
    } else {
      if (t.n < 0) {
        const abs = t.d === 1 ? String(-t.n) : `${-t.n}/${t.d}`;
        stack.push({ str: `(−${abs})`, op: null });
      } else {
        stack.push({
          str: t.d === 1 ? String(t.n) : `${t.n}/${t.d}`,
          op: null,
        });
      }
    }
  }
  return stack[0].str;
}

// ── Combinatorics ──────────────────────────────────────────────────────

function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i);
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}

function* opCombinations(k) {
  if (k === 0) {
    yield [];
    return;
  }
  for (const rest of opCombinations(k - 1))
    for (const op of OPS) yield [...rest, op];
}

function* subsetsOfSize(arr, size) {
  function* helper(start, chosen) {
    if (chosen.length === size) {
      yield chosen.slice();
      return;
    }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i]);
      yield* helper(i + 1, chosen);
      chosen.pop();
    }
  }
  yield* helper(0, []);
}

// ── Expression tree ────────────────────────────────────────────────────

function tokensToTree(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (isOp(t)) {
      const right = stack.pop(),
        left = stack.pop();
      stack.push({ isLeaf: false, op: t, left, right });
    } else {
      stack.push({ isLeaf: true, value: t });
    }
  }
  return stack[0];
}

// ── Canonicalization ───────────────────────────────────────────────────

function keyStr(k) {
  return JSON.stringify(k);
}

function intPow(base, exp) {
  return base === 1 || exp % 2 === 0 ? 1 : -1;
}

function flattenAdd(node, sign, out) {
  if (node.isLeaf || (node.op !== "+" && node.op !== "-")) {
    out.push([sign, node]);
    return;
  }
  flattenAdd(node.left, sign, out);
  flattenAdd(node.right, node.op === "+" ? sign : -sign, out);
}

function flattenMul(node, exp, out) {
  if (node.isLeaf || (node.op !== "*" && node.op !== "/")) {
    out.push([exp, node]);
    return;
  }
  flattenMul(node.left, exp, out);
  flattenMul(node.right, node.op === "*" ? exp : -exp, out);
}

function canonicalSymbolic(node) {
  if (node.isLeaf) {
    const { n, d } = node.value;
    return [n < 0 ? -1 : 1, ["val", Math.abs(n), d]];
  }

  if (node.op === "+" || node.op === "-") {
    const terms = [];
    flattenAdd(node, 1, terms);

    const cm = new Map();
    for (const [ts, child] of terms) {
      const [cs, ck] = canonicalSymbolic(child);
      const ks = keyStr(ck);
      if (cm.has(ks)) cm.get(ks)[1] += ts * cs;
      else cm.set(ks, [ck, ts * cs]);
    }

    let items = [...cm.values()].filter(([, c]) => c !== 0);
    if (!items.length) return [1, ["val", 0, 1]];

    items.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));
    let sign = 1;
    if (items[0][1] < 0) {
      items = items.map(([k, c]) => [k, -c]);
      sign = -1;
    }

    return [sign, ["add", items]];
  }

  if (node.op === "*" || node.op === "/") {
    const factors = [];
    flattenMul(node, 1, factors);

    const em = new Map();
    let sign = 1;
    for (const [power, child] of factors) {
      const [cs, ck] = canonicalSymbolic(child);
      sign *= cs;
      const ks = keyStr(ck);
      if (em.has(ks)) em.get(ks)[1] += power;
      else em.set(ks, [ck, power]);
    }

    const num = [],
      den = [];
    for (const [k, e] of em.values()) {
      if (e > 0) num.push([k, e]);
      else if (e < 0) den.push([k, -e]);
    }
    num.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));
    den.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));

    if (!num.length && !den.length) return [sign, ["val", 1, 1]];
    return [sign, ["mul", num, den]];
  }
}

function symbolicKeyToIdentityKey([overallSign, key]) {
  function valueOf(node) {
    if (!node) return null;
    if (node[0] === "val") return { n: node[1], d: node[2] };
    if (node[0] === "add") {
      let rn = 0,
        rd = 1;
      for (const [sub, mult] of node[1]) {
        const v = valueOf(sub);
        if (!v) return null;
        rn = rn * v.d + mult * v.n * rd;
        rd = rd * v.d;
        const g = gcd(Math.abs(rn), rd);
        rn /= g;
        rd /= g;
      }
      if (rd < 0) {
        rn = -rn;
        rd = -rd;
      }
      return { n: rn, d: rd };
    }
    if (node[0] === "mul") {
      const [numT, denT] = [node[1] || [], node[2] || []];
      let rn = 1,
        rd = 1;
      for (const [sub, exp] of numT) {
        const v = valueOf(sub);
        if (!v) return null;
        if (v.n === 0) return { n: 0, d: 1 };
        rn *= Math.pow(v.n, exp);
        rd *= Math.pow(v.d, exp);
      }
      for (const [sub, exp] of denT) {
        const v = valueOf(sub);
        if (!v || v.n === 0) return null;
        rn *= Math.pow(v.d, exp);
        rd *= Math.pow(v.n, exp);
      }
      if (rd < 0) {
        rn = -rn;
        rd = -rd;
      }
      const g = gcd(Math.abs(rn), Math.abs(rd));
      return { n: rn / g, d: rd / g };
    }
    return null;
  }

  function feq(v, n, d) {
    return v && v.n === n && v.d === d;
  }

  function simplify(node) {
    if (!node) return [1, null];
    if (node[0] === "val") return [1, node];

    if (node[0] === "add") {
      const cm = new Map();
      for (const [term, mult] of node[1]) {
        const [cs, s] = simplify(term);
        if (!s) continue;
        const coeff = mult * cs;
        const sv = valueOf(s);
        if (feq(sv, 0, 1)) continue;
        const ks = keyStr(s);
        if (cm.has(ks)) cm.get(ks)[1] += coeff;
        else cm.set(ks, [s, coeff]);
      }
      let items = [...cm.values()].filter(([, c]) => c !== 0);
      if (!items.length) return [1, ["val", 0, 1]];
      items.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));
      let sign = 1;
      if (items[0][1] < 0) {
        items = items.map(([k, c]) => [k, -c]);
        sign = -1;
      }
      if (items.length === 1 && items[0][1] === 1) return [sign, items[0][0]];
      return [sign, ["add", items]];
    }

    if (node[0] === "mul") {
      const [numT, denT] = [node[1] || [], node[2] || []];
      let sign = 1;
      const em = new Map();
      let zero = false;

      function handle(termList, dir) {
        for (const [child, power] of termList) {
          const [cs, s] = simplify(child);
          if (!s) continue;
          sign *= intPow(cs, power);
          const sv = valueOf(s);
          if (sv !== null) {
            if (feq(sv, 0, 1)) {
              zero = true;
              return;
            }
            if (feq(sv, 1, 1)) continue;
            if (feq(sv, -1, 1)) {
              sign *= intPow(-1, power);
              continue;
            }
          }
          const exp = dir * power;
          const ks = keyStr(s);
          if (em.has(ks)) em.get(ks)[1] += exp;
          else em.set(ks, [s, exp]);
        }
      }

      handle(numT, 1);
      if (zero) return [1, ["val", 0, 1]];
      handle(denT, -1);
      if (zero) return [1, ["val", 0, 1]];

      const num = [],
        den = [];
      for (const [k, e] of em.values()) {
        if (e > 0) num.push([k, e]);
        else if (e < 0) den.push([k, -e]);
      }
      num.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));
      den.sort((a, b) => keyStr(a[0]).localeCompare(keyStr(b[0])));

      if (!num.length && !den.length) return [sign, ["val", 1, 1]];
      if (!den.length && num.length === 1 && num[0][1] === 1)
        return [sign, num[0][0]];
      if (!num.length && den.length === 1 && den[0][1] === 1)
        return [sign, ["mul", [], den]];
      return [sign, ["mul", num, den]];
    }
  }

  const [exprSign, simplified] = simplify(key);
  const final = simplified || ["val", 0, 1];
  if (keyStr(final) === keyStr(["val", 0, 1])) return [1, final];
  return [overallSign * exprSign < 0 ? -1 : 1, final];
}

// ── Grouped solver ─────────────────────────────────────────────────────
//
// numbers:    array of fraction objects { n, d }
// targetFrac: fraction object { n, d }  (default: 24/1)
// mode:       'exact' | 'closest'       (default: 'exact')
// numMode:    'all' | 'any'             (default: 'all')
//
// Returns array of identity groups:
//   { total, subgroups: [{ infixes }] }
//
// In closest mode, also attaches per-group:
//   { value: {n,d}, valueFlt: number, distance: number }
// Groups are sorted by distance ascending.

function solveGrouped(numbers, targetFrac, mode, numMode, infixFn) {
  if (!targetFrac) targetFrac = { n: 24, d: 1 };
  if (!mode) mode = "exact";
  if (!numMode) numMode = "all";
  if (!infixFn) infixFn = toDisplayInfix;

  const targetFlt = targetFrac.n / targetFrac.d;
  const sizes =
    numMode === "any"
      ? Array.from({ length: numbers.length }, (_, i) => i + 1)
      : [numbers.length];

  // Collect unique expressions (token arrays keyed by canonical infix)
  const unique = new Map();
  for (const size of sizes) {
    for (const subset of subsetsOfSize(numbers, size)) {
      for (const ops of opCombinations(size - 1)) {
        const combined = [...subset, ...ops];
        for (const perm of permutations(combined)) {
          if (!isValidRPN(perm)) continue;
          const result = evaluateRPN(perm);
          if (!result) continue;
          if (
            mode === "exact" &&
            (result.n !== targetFrac.n || result.d !== targetFrac.d)
          )
            continue;
          const infix = rpnToInfix(perm);
          if (!unique.has(infix)) unique.set(infix, perm);
        }
      }
    }
  }

  // Group by symbolic key (commutativity + associativity)
  const symGroups = new Map();
  for (const [, tokens] of unique) {
    const symKey = canonicalSymbolic(tokensToTree(tokens));
    const ks = keyStr(symKey);
    if (!symGroups.has(ks)) symGroups.set(ks, { key: symKey, tokensList: [] });
    symGroups.get(ks).tokensList.push(tokens);
  }

  // Group by identity key (further collapses x+0, x*1 variants)
  const idGroups = new Map();
  for (const { key, tokensList } of symGroups.values()) {
    const idKey = symbolicKeyToIdentityKey(key);
    const iks = keyStr(idKey);
    if (!idGroups.has(iks)) idGroups.set(iks, []);
    idGroups.get(iks).push({ tokensList });
  }

  // Convert to display format
  const groups = [...idGroups.values()].map((subgroupList) => {
    const subgroups = subgroupList.map((sg) => ({
      infixes: [...new Set(sg.tokensList.map((t) => infixFn(t)))].sort(),
    }));
    const group = {
      total: subgroups.reduce((s, sg) => s + sg.infixes.length, 0),
      subgroups,
    };

    if (mode === "closest") {
      const val = evaluateRPN(subgroupList[0].tokensList[0]);
      if (val) {
        group.value = val;
        group.valueFlt = val.n / val.d;
        group.distance = Math.abs(group.valueFlt - targetFlt);
      } else {
        group.distance = Infinity;
      }
    }

    return group;
  });

  if (mode === "closest") {
    groups.sort((a, b) => a.distance - b.distance);
  }

  return groups;
}

// ── Input parsing ──────────────────────────────────────────────────────

// Parse a decimal string, integer, or fraction (x/y) into an exact fraction.
function parseInput(str) {
  str = str.trim();
  if (!str) return null;

  // Fraction form: x/y
  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length !== 2) return null;
    const num = parts[0].trim(),
      den = parts[1].trim();
    if (!/^-?\d+$/.test(num) || !/^-?\d+$/.test(den)) return null;
    const pn = parseInt(num, 10),
      pd = parseInt(den, 10);
    if (Math.abs(pn) > 1e9 || Math.abs(pd) > 1e9) return null;
    return frac(pn, pd);
  }

  // Decimal / integer form
  if (str === "-" || str === ".") return null;
  if (!/^-?\d*\.?\d*$/.test(str)) return null;
  const neg = str.startsWith("-");
  const abs = neg ? str.slice(1) : str;
  if (!abs || abs === ".") return null;
  const dotIdx = abs.indexOf(".");
  if (dotIdx === -1) {
    const n = parseInt(abs, 10);
    if (isNaN(n) || n > 1e9) return null;
    return frac(neg ? -n : n, 1);
  }
  const intPart = dotIdx === 0 ? 0 : parseInt(abs.slice(0, dotIdx), 10);
  const decStr = abs.slice(dotIdx + 1);
  if (decStr.length > 8) return null;
  const d = Math.pow(10, decStr.length || 1);
  const decVal = decStr ? parseInt(decStr, 10) : 0;
  const n = intPart * d + decVal;
  if (Math.abs(n) > 1e9) return null;
  return frac(neg ? -n : n, d);
}

function fracToString(f) {
  return f.d === 1 ? String(f.n) : `${f.n}/${f.d}`;
}

if (typeof module !== "undefined") {
  module.exports = { solveGrouped, rpnToInfix, frac, parseInput, fracToString };
}
