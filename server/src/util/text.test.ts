import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRequirementLines, stripRequirementIdReferences } from "./text.ts";

test("a single-line rewrite stays one requirement", () => {
  assert.deepEqual(
    splitRequirementLines("Search results appear within 500ms."),
    ["Search results appear within 500ms."],
  );
});

test("an atomic split becomes multiple trimmed requirements", () => {
  assert.deepEqual(
    splitRequirementLines("  Upload a photo.  \nCrop a photo.\n\nTag a photo.  "),
    ["Upload a photo.", "Crop a photo.", "Tag a photo."],
  );
});

test("blank input produces no lines", () => {
  assert.deepEqual(splitRequirementLines("   \n  \n"), []);
});

test("strips parenthetical id citations", () => {
  assert.equal(
    stripRequirementIdReferences(
      "The ledger equals shares minus any recorded payments (per FR-12). Payments persist.",
    ),
    "The ledger equals shares minus any recorded payments. Payments persist.",
  );
  assert.equal(
    stripRequirementIdReferences("Balances update (see REQ-003) after each expense."),
    "Balances update after each expense.",
  );
  assert.equal(
    stripRequirementIdReferences("Reminders respect quiet hours (FR-7)."),
    "Reminders respect quiet hours.",
  );
});

test("strips inline per/see citations", () => {
  assert.equal(
    stripRequirementIdReferences("Payments reduce the balance as per FR-12."),
    "Payments reduce the balance.",
  );
  assert.equal(
    stripRequirementIdReferences("The split must sum to the total, per REQ-009, before saving."),
    "The split must sum to the total, before saving.",
  );
});

test("leaves text without citations untouched", () => {
  const text = "A user can split an expense equally among all members of the group.";
  assert.equal(stripRequirementIdReferences(text), text);
});

test("leaves bare ids in unusual prose alone rather than mangling", () => {
  const text = "FR-12 semantics apply to refunds.";
  assert.equal(stripRequirementIdReferences(text), text);
});

test("preserves newlines so atomic splits survive stripping", () => {
  assert.equal(
    stripRequirementIdReferences("Upload a photo (per FR-2).\nCrop a photo."),
    "Upload a photo.\nCrop a photo.",
  );
});
