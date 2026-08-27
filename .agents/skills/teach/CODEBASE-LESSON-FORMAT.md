# Codebase lesson format

Use this file **only** when the user is learning a codebase (a function, file, or module they pointed at, or a mission to change that code).

Do **not** use it for a general subject that is not code: physics, math, yoga, a spoken language, and so on.

Exception: if a non-repo topic would still benefit from the same shape — almost always a **programming** topic (how a language feature evaluates, what a snippet returns) — use this file. If you are unsure and the topic is not code, ignore this file.

The examples below are generic on purpose. Do not copy a specific project's types into this skill.

## What to show

Show **many** traces. A trace is a small, real-shaped input and the output the real procedure produces. Prefer tables and aligned columns over paragraphs.

Pull traces from:

1. Comments and `SAMPLE` blocks next to the function
2. The tests for that function (each `it(...)` is usually one trace)
3. Tiny cases you construct that still match the types, then verify against the tests or by running the function

Cover the branches that matter, not three copies of the happy path. Stop when another trace would not change what they would predict.

Show the worked traces **before** you ask them to predict. Then give a new input they have not seen and hide the output.

## Shape of a trace

Keep the same columns the code cares about. Drop fields that do not affect this function. Mark placeholders with `·` when a column is listed for alignment but unused in this case, and say so in one line.

```
Input:
n    flag
0    false
1    true
2    true

Output:
0, false → skip
1, true  → keep
2, true  → keep
```

After two or three of those, one line of rule is allowed. The traces come first. The rule is the compression, not the lesson.

## How to test

The default check is recall of an output, not a vocabulary quiz.

- Given this input, what is the result?
- Write the full mapping for this input.
- Change one field and say what breaks.

Immediate feedback. If they type the output, compare it to the real procedure's result, not to a paraphrase.

Multiple-choice is fine as a warm-up if the two answers have the same character count. It is not a substitute for a predict-the-output item.

## Goal and why still apply

The lesson still opens with Goal and Why. Each trace block can use a one-line Goal ("see the skip case") and a one-line Why ("a naive always-keep rule gets this wrong"). Do not skip them because the traces feel self-explanatory.

## Show the source that does that subsection

Every subsection that teaches a behavior must, if it applies, show the **actual primary source** for that behavior, not a paraphrase of it.

Do this after Goal/Why, usually next to the first trace for that subsection.

**What to paste**

- The lines that implement *this* subsection's behavior, copied from the file (keep comments that sit on those lines).
- Surrounding lines when the slice would otherwise be incomplete: the `if` that contains the branch, the loop header, the `return` that uses the result. A reader should be able to find those lines in the file without guessing. Highlight the relevant lines. Leave the neighbors visible and unhighlighted.
- Render source with the shared **code-slice** component (`./assets/code-slice.js`, styles in `lesson.css`). File header, line numbers, light syntax color (JS/TS/Python), green focus rows like a GitHub hunk. Do not dump a plain `<pre>` for source. Input/output traces stay plain `<pre><code>` tables. They are not source.

Markup:

```html
<pre
  class="code-slice"
  data-file="src/lib/example.ts"
  data-href="../../src/lib/example.ts"
  data-lang="ts"
  data-start="10"
  data-focus="12-14,18"
><code>...contiguous lines from the file, including neighbors...</code></pre>
```

`data-start` is the file line of the first line in the block. `data-focus` is those same file line numbers (ranges allowed). `data-lang` is `ts`, `js`, or `py`. Link `code-slice.js` after the lesson body. Do not dump the whole function on every heading.

**What not to paste**

- The entire function under every heading. Each subsection gets only the slice that implements that case. A Predict or Poke section that only asks them to use a rule they already saw does not need another copy of the same snippet — skip when there is no new code to show.

**Breakdown**

Right under the snippet, say what those lines do, in order. One short note per condition, assignment, or loop — not a rewrite of the function in prose. Point at identifiers the user can search.

Example shape:

```
Goal / Why
code-slice (neighbors + green focus on the branch)
"this branch is the skip case.
 this branch is the keep case."
Input / Output trace
```

If the subsection is only a quiz or a simulator, do not paste the source again unless the item depends on a line they have not seen yet.

## What not to do

- Do not open with a control-flow essay and one toy example at the end.
- Do not invent traces that the primary source or its tests would reject. If you made it up, run it or match an existing case.
- Do not explain nearby topics unless this subsection actually uses that fact in the trace.
