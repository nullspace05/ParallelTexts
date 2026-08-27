# Codebase lesson format

Use this file only when the user is learning a **part of this repo**. For yoga, a language from scratch, or any topic that is not a file they have open, ignore this file.

## Detect it

Any of these is enough:

- They pointed at a function, file, or symbol (`@src/lib/foo.ts:85`)
- The mission is to understand or change that code
- They said they are reading the codebase, not learning a skill on its own

If you are unsure, ask once. Do not mix a codebase lesson with a standalone-skill lesson in the same HTML file.

## What to show

Show **many** traces. A trace is a small, real-shaped input and the output the code actually produces. Prefer tables and aligned columns over paragraphs.

Pull traces from:

1. Comments and `SAMPLE` blocks next to the function
2. The tests for that function (each `it(...)` is usually one trace)
3. Tiny cases you construct that still match the types, then verify against the tests or by running the function

Cover the branches that matter, not three copies of the happy path. For grouping, that means a normal 1:1 pair, a 0:1 orphan that attaches forward, a 0:1 that falls back backward, a leading orphan, stacked orphans. Stop when another trace would not change what they would predict.

Show the worked traces **before** you ask them to predict. Then give a new input they have not seen and hide the output.

## Shape of a trace

Keep the same columns the code cares about. Drop fields that do not affect this function.

```
Input:
src_para  tgt_para  src_text              tgt_text
115       96        "Hello."              "こんにちは。"
null      97        ""                    "In middle school?"   ← 0:1 orphan
116       97        "Wait."               "待て、羽川…"
116       97        "What?"               "何？"

Output:
115 → [ { src: "Hello.", tgt: "こんにちは。" } ]
116 → [
        { src: "",      tgt: "In middle school?" },  // attached forward (same tgt_para 97)
        { src: "Wait.", tgt: "待て、羽川…" },
        { src: "What?", tgt: "何？" },
      ]
```

After two or three of those, one line of rule is allowed. The traces come first. The rule is the compression, not the lesson.

## How to test

The default check is recall of an output, not a vocabulary quiz.

- Given this input, which bucket does row 2 land in?
- Write the `Map` (or the `ParagraphData[]`) for this input.
- Change one field (for example `tgt_para` on the orphan) and say what breaks.

Immediate feedback. If they type the output, compare it to the real function's result, not to a paraphrase.

Multiple-choice is fine as a warm-up if the two answers have the same character count. It is not a substitute for a predict-the-output item.

## Goal and why still apply

The lesson still opens with Goal and Why. Each trace block can use a one-line Goal ("see a forward attach") and a one-line Why ("this is the case a naive previous-paragraph rule gets wrong"). Do not skip them because the traces feel self-explanatory.

## Show the code that does that subsection

Every subsection that teaches a behavior of the code must show the **actual source** for that behavior, not a paraphrase of it.

Do this after Goal/Why, usually next to the first trace for that subsection.

**What to paste**

- The lines that implement *this* subsection's behavior, copied from the file (keep comments that sit on those lines).
- Surrounding lines when the slice would otherwise be incomplete: the `if` that contains the branch, the loop header, the `return` that uses the result. A reader should be able to find those lines in the file without guessing.
- Link to the file. Line numbers in a comment or a `startLine:endLine:path` citation are enough; do not dump the whole function on every heading.

**What not to paste**

- The entire function under every heading. Ordinary grouping gets the `src_para_idx !== null` branch. Forward attach gets the inner `for` that looks ahead. A Predict or Poke section that only asks them to use a rule they already saw does not need another copy of the same snippet — "if applicable" means skip when there is no new code to show.

**Breakdown**

Right under the snippet, say what those lines do, in order. One short note per condition, assignment, or loop — not a rewrite of the function in prose. Point at identifiers the user can search (`lastSrcParaIdx`, `next.tgt_para_idx === pair.tgt_para_idx`).

Example shape:

```
Goal / Why
[5–15 lines from src/lib/alignment-paragraphs.ts]
"if src_para_idx is set, idx is that number and lastSrcParaIdx updates.
 else we start from lastSrcParaIdx and maybe overwrite it below."
Input / Output trace
```

If the subsection is only a quiz or a simulator, do not paste code again unless the item depends on a line they have not seen yet.

## What not to do

- Do not open with a control-flow essay and one toy example at the end.
- Do not invent traces that the tests would fail. If you made it up, run it or match an existing test.
- Do not explain Needleman–Wunsch, the framework, or nearby files unless this function actually uses that fact in the trace.
