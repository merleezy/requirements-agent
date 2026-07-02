import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRequirementLines } from "./text.ts";

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
