# Defect log

One entry per defect that escaped the pipeline (shipped in a PRD that passed review, or survived review rounds that should have caught it).
This log exists for two reasons:

1. **Principle extraction.**
   Periodically review the entries and ask what principle explains a cluster of them, rather than patching each case.
   The classification field is the key input: per the seventh prompt pass, model capability fixes judgment failures, while prompt changes fix blind spots the rules themselves create.
   Diagnose which kind a defect is before reaching for either fix.
2. **Regression set.**
   Going forward, save the offending PRD JSON alongside the entry (under `docs/defect-prds/`), so candidate prompt changes can be replayed against past failures before shipping.
   Backfilled entries below predate this practice and have no preserved artifact.

Classification values:

- `capability` - the rules covered it, but the model's judgment missed it; a stronger model catches it with the same prompt.
- `rule blind spot` - one or more rules actively suppressed the finding; no model can fix what the rules forbid.
- `rule gap` - nothing in the prompts addressed the defect class and the model did not generalize to it on its own.

Entry template:

```
## D-n: short title
- Date:
- PRD: which document / iteration it shipped in
- Defect: what actually shipped
- Escaped because: which stage should have caught it, and why it did not
- Classification: capability | rule blind spot | rule gap
- Resolution: what fixed it (prompt pass, model change, parser guard), or "open"
- Artifact: path to the saved PRD JSON, or "not preserved"
```

---

## D-1: dangling requirement id citation

- Date: 2026-07-02
- PRD: roommate expense splitter, first full-pipeline PRD
- Defect: REQ-011 cited "FR-12", which resolved to nothing a reader could find (ids are server-owned and the UI renders a positional display sequence).
- Escaped because: no stage forbade cross-requirement citations; the critic reviews requirements individually and cannot see that a citation dangles.
- Classification: rule gap
- Resolution: fifth prompt pass - requirement text must stand alone across draft/critic/revise, plus the `stripRequirementIdReferences` parser guard (`server/src/util/text.ts`).
- Artifact: not preserved

## D-2: clause-stacked requirement (altitude)

- Date: 2026-07-02
- PRD: roommate expense splitter, first full-pipeline PRD
- Defect: REQ-011 was a 40-word clause-stacked paragraph next to one-line requirements, produced by revise passes resolving flags by appending provisos.
- Escaped because: no altitude guidance existed; the critic's dimensions do not measure sentence structure.
- Classification: rule gap
- Resolution: fifth prompt pass - one behavior per sentence; multi-rule changes split into separate requirements.
- Artifact: not preserved

## D-3: requirement presupposing an open question

- Date: 2026-07-02
- PRD: roommate expense splitter, first full-pipeline PRD
- Defect: the document both asked "should expenses be editable?" in openQuestions and contained a requirement assuming edits exist.
- Escaped because: revise-local could not know a decision was deliberately deferred (it never saw openQuestions); no stage compared requirements against the questions list.
- Classification: rule gap
- Resolution: fifth prompt pass - draft/revise must not presuppose open-question answers; revise-local gained openQuestions as read-only context; final-review principle 5.
- Artifact: not preserved

## D-4: net-ledger vs pairwise-debts model ambiguity

- Date: 2026-07-02
- PRD: roommate expense splitter, first full-pipeline PRD
- Defect: two teams would ship different debt models; the document never committed to one.
- Escaped because: a cross-requirement defect the per-requirement critic structurally cannot see, and the reviewer's open-ended "find risks" pass under-sampled it.
- Classification: rule gap
- Resolution: fifth prompt pass - Coherence Checklist added to final review (now the Coherence Principles).
- Artifact: not preserved

## D-5: unspecified equal-split rounding

- Date: 2026-07-02
- PRD: roommate expense splitter, first full-pipeline PRD (and again in the second and third PRDs)
- Defect: an equal split of an amount that does not divide evenly ($10 among 3) had no specified remainder assignment; survived three consecutive PRDs.
- Escaped because: abstract phrasing ("parts must sum to a whole") did not land with the reviewing model; only naming the concrete case worked.
- Classification: capability (a stronger model later generalized from the single named example on its own)
- Resolution: sixth pass part two named the concrete case in checklist item 1; seventh pass moved Balanced final_review to a stronger model.
- Artifact: not preserved

## D-6: speculative prose inside a requirement

- Date: 2026-07-02
- PRD: roommate expense splitter, second full-pipeline PRD
- Defect: a requirement contained "if debt simplification is introduced in the future, it would be an additional transformation layered on top" - prose written to appease the reviewer, not testable behavior.
- Escaped because: the model performed checklist compliance instead of achieving it; no rule forbade rationale/speculative text in requirement bodies.
- Classification: rule gap
- Resolution: sixth pass part one - requirement text states current, observable behavior only.
- Artifact: not preserved

## D-7: concatenated words introduced by draft

- Date: 2026-07-02
- PRD: roommate expense splitter, second full-pipeline PRD
- Defect: "meansthe" squished text arrived via the draft agent.
- Escaped because: the third pass's word-boundary guard was revise-local-only; draft had no equivalent rule.
- Classification: rule gap (a guard existed but did not cover the producing stage)
- Resolution: sixth pass part one - draft + revise-global must preserve exact word boundaries and proofread for concatenations.
- Artifact: not preserved

## D-8: inconsistent failure semantics across sibling validations

- Date: 2026-07-02
- PRD: roommate expense splitter, second full-pipeline PRD
- Defect: one validation rule said "rejects and displays an error" while a sibling in the same domain said "must ensure".
- Escaped because: the critic judges each requirement alone; consistency across siblings is invisible to it, and the reviewer had no rule for it.
- Classification: rule gap
- Resolution: sixth pass part one - same-domain validation rules must share consistent failure semantics.
- Artifact: not preserved

## D-9: action defined against a derived view

- Date: 2026-07-02
- PRD: roommate expense splitter, third full-pipeline PRD
- Defect: users could "settle" pairwise balances while the summary displayed simplified payment edges with no underlying pairwise record - two teams would ship different products.
- Escaped because: checklist item 2 covered "one concept, two definitions" but not derived views; the composition of a view requirement and an action requirement was unexamined.
- Classification: rule gap
- Resolution: sixth pass part two - derived-views check added to item 2 (now principle 2).
- Artifact: not preserved

## D-10: defer-and-decide conflict between outOfScope and openQuestions

- Date: 2026-07-02
- PRD: roommate expense splitter, third full-pipeline PRD
- Defect: outOfScope excluded multi-currency support while an open question still asked whether to support multiple currencies.
- Escaped because: the checklist compared openQuestions against requirements only; the wording was structurally unable to see outOfScope.
- Classification: rule blind spot (the rule's own scoping excluded the section containing the conflict)
- Resolution: sixth pass part two - item 5 (now principle 5) compares openQuestions against the ENTIRE document including outOfScope.
- Artifact: not preserved

## D-11: belt-and-suspenders duplication

- Date: 2026-07-02
- PRD: roommate expense splitter, fourth full-pipeline PRD
- Defect: dominant defect of the iteration - a user-capability requirement whose system effect was restated as a separate requirement ("A user can edit an expense. Editing updates balances." plus "When an expense is edited, the system recalculates balances."), apparently written to demonstrate lifecycle compliance.
- Escaped because: no dedup rule existed; each duplicate reads fine in isolation to the per-requirement critic.
- Classification: rule gap
- Resolution: seventh pass - state each behavior exactly once (draft + revise-global).
- Artifact: not preserved

## D-12: roadmap idea in openQuestions

- Date: 2026-07-02
- PRD: roommate expense splitter, fourth full-pipeline PRD
- Defect: "should balance simplification be added in the future on top of the current ledger?" - roadmap noise that migrated into the questions list after the sixth pass banned speculation in requirement text.
- Escaped because: openQuestions had no scoping rule; banning a defect in one section displaced it to another.
- Classification: rule gap (with a displacement mechanism worth remembering)
- Resolution: seventh pass - openQuestions are this-version decisions only.
- Artifact: not preserved

## D-13: payer-excluded-from-split remainder edge

- Date: 2026-07-02
- PRD: roommate expense splitter, fourth full-pipeline PRD (A/B observation)
- Defect: the remainder-assignment edge case when the payer is excluded from the split; no prior review round surfaced it.
- Escaped because: re-running the unchanged prompt on a stronger model caught it (and every other defect class the weaker model passed) - pure judgment, not rules.
- Classification: capability
- Resolution: seventh pass - Balanced preset's final_review stage moved to a stronger model; two proposed checklist tweaks deliberately dropped as unnecessary.
- Artifact: not preserved

## D-14: entities writable but never viewable (read-path gap)

- Date: 2026-07-02
- PRD: roommate expense splitter, fifth full-pipeline PRD (opus draft, fable final review)
- Defect: expenses could be recorded, edited, and deleted but never viewed or listed; three review rounds never flagged it.
- Escaped because: rule composition - draft's "only include what traces back" excluded the obvious to a disciplined model, while the reviewer's "do NOT expand scope" constraint plus the "missing spec completeness" do-not-report entry actively suppressed the flag.
  Two well-followed rules composed into a blind spot; a smarter model cannot fix what the rules forbid.
- Classification: rule blind spot
- Resolution: eighth pass - draft's "the read path is traceable" rule; final-review principle 3 checks the read path with an explicit not-scope-expansion carve-out.
- Artifact: not preserved
