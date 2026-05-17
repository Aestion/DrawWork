# OpenClaw Project — Claude Code Guidelines

> **Project-specific overrides and additions to global guidelines.**
> See `~/.claude/CLAUDE.md` for base rules (Skills Priority, TDD, Debugging, etc.)
>
> **Note:** You can also invoke Superpowers skills directly via `/superpowers:<skill-name>`

---

## Project Context

This is the **OpenClaw** project — a Claude Code / Claude Agent SDK related tool.

- Read existing code before proposing changes. Follow established patterns.
- Prefer smaller, focused files over large ones.
- Design for isolation: each unit has one clear purpose, communicates through well-defined interfaces.
- YAGNI ruthlessly. Remove unnecessary features from all designs.

## Project-Specific Overrides

### Brainstorming Output Location

Standard brainstorming designs go to:
```
docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
```

**Brainstorming Checklist (必须按顺序完成):**

1. **Explore project context** — 检查文件、文档、近期提交
2. **Offer visual companion** (如果涉及视觉问题) — 单独一条消息，不与其他内容混合
3. **Ask clarifying questions** — 一次一个，了解目的/约束/成功标准
4. **Propose 2-3 approaches** — 带 trade-offs 和你的推荐
5. **Present design** — 按复杂度分段展示，每段后获得用户确认
6. **Write design doc** — 保存到规格文件
7. **Spec self-review** — 检查占位符、矛盾、歧义、范围
8. **User reviews written spec** — 请用户 Review 规格文件
9. **Transition to implementation** — 进入 writing-plans

**Hard Gate:** 在呈现设计并获得用户批准之前，**不要**调用任何实现技能、编写代码或搭建项目。

**Anti-Pattern:** "This is too simple to need a design." 即使是 todo list、单功能工具、配置更改——所有项目都需要设计。

### Plan Output Location

Implementation plans go to:
```
docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md
```

**Plan header (required):**
```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Use subagent-driven-development or executing-plans.

**Goal:** [One sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [Key technologies]
```

### Issue Triage Workflow

This project uses structured issue management. When managing issues:

**State roles:**
- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter for more information
- `ready-for-agent` — fully specified, ready for an AFK agent
- `ready-for-human` — needs human implementation
- `wontfix` — will not be actioned

**Triage process:**
1. **Gather context** — Read full issue, explore codebase using domain glossary
2. **Attempt reproduction** (bugs only) — Before grilling, try to repro
3. **Grill if needed** — Use grill session to flesh out unclear issues
4. **Apply outcome:**
   - `ready-for-agent` — Post agent brief with technical summary
   - `ready-for-human` — Note why it can't be delegated
   - `needs-info` — Specific actionable questions, not "please provide more info"
   - `wontfix` — Polite explanation, write to `.out-of-scope/` if enhancement

**Category roles:**
- `bug` — something is broken
- `enhancement` — new feature or improvement

## Domain Glossary

**Maintain in CONTEXT.md at project root.** Key terms for this project:

- **OpenClaw**: The project name — a Claude Code / Agent SDK related tool
- **Skill**: A reusable capability or procedure for Claude Code
- **Superpowers**: Extended capabilities beyond base functionality

*(Add new terms to CONTEXT.md as they crystallize during grill sessions)*

---

## Appendix A: TDD Red-Green-Refactor (Detailed)

### The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Write code before the test? **Delete it. Start over.**

### RED-GREEN-REFACTOR Cycle

```
RED (Write failing test)
    ↓
Verify RED (Watch it fail — MANDATORY, never skip)
    ↓
GREEN (Write minimal code)
    ↓
Verify GREEN (Watch it pass)
    ↓
REFACTOR (Clean up, keep tests green)
    ↓
Next test
```

### Good vs Bad Tests

| Quality | Good | Bad |
|---------|------|-----|
| **Minimal** | One thing. "and" in name? Split it. | `test('validates email and domain and whitespace')` |
| **Clear** | Name describes behavior | `test('test1')` |
| **Shows intent** | Demonstrates desired API | Obscures what code should do |
| **Real code** | Tests real behavior, no mocks | Tests mock behavior |

### Common Rationalizations (STOP and Start Over)

| Excuse | Reality |
|--------|---------|
| "Too simple to test" | Simple code breaks. Test takes 30 seconds. |
| "I'll test after" | Tests passing immediately prove nothing. |
| "Tests after achieve same goals" | Tests-after = "what does this do?" Tests-first = "what should this do?" |
| "Already manually tested" | Ad-hoc ≠ systematic. No record, can't re-run. |
| "Deleting X hours is wasteful" | Sunk cost fallacy. Keeping unverified code is technical debt. |
| "TDD will slow me down" | TDD is faster than debugging. |
| "This is different because..." | No exceptions. |

**Red Flags:** Code before test, test passes immediately, "keep as reference", "just this once".

### Verification Checklist

- [ ] Every new function/method has a test
- [ ] Watched each test fail before implementing
- [ ] Each test failed for expected reason (feature missing, not typo)
- [ ] Wrote minimal code to pass each test
- [ ] All tests pass
- [ ] Output pristine (no errors, warnings)
- [ ] Tests use real code (mocks only if unavoidable)

---

## Appendix B: Systematic Debugging (Detailed)

### The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

### The Four Phases

| Phase | Key Activities | Success Criteria |
|-------|---------------|------------------|
| **1. Root Cause** | Read errors carefully, reproduce consistently, check recent changes, trace data flow, gather evidence | Understand WHAT and WHY |
| **2. Pattern Analysis** | Find working examples, compare against references, identify differences | Know what's different |
| **3. Hypothesis** | Form single clear theory, test minimally, one variable at a time | Confirmed or new hypothesis |
| **4. Implementation** | Create failing test first, implement single fix, verify | Bug resolved, tests pass |

**MUST complete each phase before proceeding to the next.**

### Phase 1: Root Cause Investigation (BEFORE any fix)

1. **Read Error Messages Carefully** — Don't skip past errors. Stack traces often contain the exact solution.
2. **Reproduce Consistently** — Can you trigger it reliably? What are the exact steps?
3. **Check Recent Changes** — Git diff, recent commits, new dependencies
4. **Gather Evidence in Multi-Component Systems** — For CI → build → signing, API → service → DB:
   - Log what data enters each component
   - Log what data exits each component
   - Run once to gather evidence showing WHERE it breaks
5. **Trace Data Flow** — Where does bad value originate? Keep tracing up until you find the source.

### Phase 4.5: If 3+ Fixes Failed

**Pattern indicating architectural problem:**
- Each fix reveals new shared state/coupling/problem in different place
- Fixes require "massive refactoring" to implement
- Each fix creates new symptoms elsewhere

**STOP and question fundamentals:**
- Is this pattern fundamentally sound?
- Should we refactor architecture vs. continue fixing symptoms?

**Discuss with your human partner before attempting more fixes.**

### Common Rationalizations (STOP and Return to Phase 1)

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |

### Red Flags — STOP and Follow Process

- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- Proposing solutions before tracing data flow
- "One more fix attempt" (when already tried 2+)
- Each fix reveals new problem in different place

---

## Appendix C: Plan Writing Guidelines (Detailed)

### Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" — step
- "Run it to make sure it fails" — step
- "Implement the minimal code to make the test pass" — step
- "Run the tests and make sure they pass" — step
- "Commit" — step

### No Placeholders (Plan Failures)

Never write:
- "TBD", "TODO", "implement later", "fill in details"
- "Add appropriate error handling" / "add validation" / "handle edge cases"
- "Write tests for the above" (without actual test code)
- "Similar to Task N" (repeat the code)
- Steps that describe what to do without showing how

### Task Structure Template

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`
- Test: `tests/exact/path/to/test.py`

- [ ] **Step 1: Write the failing test**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/path/test.py::test_name -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**

```python
def function(input):
    return expected
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/path/test.py::test_name -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/path/test.py src/path/file.py
git commit -m "feat: add specific feature"
```
````

### Self-Review Checklist (After Writing Plan)

1. **Spec coverage:** Skim each requirement in the spec. Can you point to a task that implements it? List any gaps.
2. **Placeholder scan:** Search for red flags — TBD, TODO, vague requirements. Fix them.
3. **Type consistency:** Do types, method signatures, property names match across tasks?

---

## Appendix D: Karpathy Coding Guidelines

Behavioral guidelines to reduce common LLM coding mistakes (derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876)).

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Quick Reference: Available Superpowers Skills

你可以直接调用这些技能：

| 技能 | 调用方式 | 用途 |
|------|---------|------|
| brainstorming | `/superpowers:brainstorming` | 编写代码前的设计探索 |
| test-driven-development | `/superpowers:test-driven-development` | TDD 红绿重构循环 |
| systematic-debugging | `/superpowers:systematic-debugging` | 系统性调试 |
| writing-plans | `/superpowers:writing-plans` | 编写实现计划 |
| subagent-driven-development | `/superpowers:subagent-driven-development` | 子代理驱动开发 |
| executing-plans | `/superpowers:executing-plans` | 批量执行计划 |
| requesting-code-review | `/superpowers:requesting-code-review` | 代码审查请求 |
| receiving-code-review | `/superpowers:receiving-code-review` | 响应审查反馈 |
| using-git-worktrees | `/superpowers:using-git-worktrees` | Git worktree 操作 |
| finishing-a-development-branch | `/superpowers:finishing-a-development-branch` | 完成开发分支 |
| verification-before-completion | `/superpowers:verification-before-completion` | 完成前验证 |
