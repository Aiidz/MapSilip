import assert from "node:assert/strict";
import { test } from "node:test";
import { isNavigationItemActive } from "../app/lib/navigation.mjs";

test("keeps a section selected for its nested pages", () => {
  assert.equal(
    isNavigationItemActive("/management/rooms/204", "/management/rooms"),
    true,
  );
});

test("keeps the caretaker section selected on its child screens", () => {
  assert.equal(
    isNavigationItemActive("/caretaker/maintenance", "/caretaker/maintenance"),
    true,
  );
});

test("does not select the home item on unrelated nested pages", () => {
  assert.equal(
    isNavigationItemActive("/tenant/payments", "/tenant", true),
    false,
  );
});

test("does not select a partial path match", () => {
  assert.equal(
    isNavigationItemActive("/management/rooms-old", "/management/rooms"),
    false,
  );
});
