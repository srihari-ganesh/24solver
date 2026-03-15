# 24 Solver

A web app that finds all arithmetic expressions using 4 integers that equal 24.

**Live:** https://srihari-ganesh.github.io/24solver

## How it works

Given 4 integers, the solver enumerates every valid [Reverse Polish Notation](https://en.wikipedia.org/wiki/Reverse_Polish_notation) expression using those numbers and the operators `+`, `-`, `*`, `/`. Arithmetic is done with exact rational fractions to avoid floating-point errors (e.g. `8 / (3 - 8/3) = 24` resolves correctly).

**Algorithm:**
1. Generate all combinations of 3 operators from `{+, -, *, /}` (4³ = 64 combos)
2. For each combo, form a 7-token sequence (4 numbers + 3 operators)
3. Enumerate all permutations of those 7 tokens (up to 5040)
4. Filter to valid RPN sequences, evaluate with rational arithmetic
5. Collect infix representations in a `Set` for deduplication

Total work per query: ≤ 64 × 5040 = 322,560 evaluations — runs instantly in the browser.

## Classic test cases

| Input | Result |
|-------|--------|
| `3 3 8 8` | `(8 / (3 - (8 / 3)))` (and others) |
| `1 1 1 1` | No solution |
| `4 4 4 4` | `(4 - 4 + 4) * 4` (and others) |
| `1 1 11 11` | Addition-only solutions |

## Deployment

Pure static HTML/CSS/JS — no build step needed.

1. Create a repo named `24solver` on GitHub under your account
2. Push `index.html` (and this README)
3. In repo Settings → Pages, set source to the `main` branch root
4. Site goes live at `https://<username>.github.io/24solver`
