import assert from "node:assert/strict";
import test from "node:test";
import { planInput } from "./plan.ts";
import { defaultSettings } from "./types.ts";
import { applyAction, initialWorld } from "./world.ts";

const settings = defaultSettings;

test("router opens notepad and types without a model", () => {
  const plan = planInput("open notepad and type hello", settings, initialWorld());
  assert.equal(plan.via, "router");
  assert.deepEqual(
    plan.steps.map((step) => step.action.op),
    ["open_app", "type_text"],
  );
});

test("delete asks first", () => {
  const plan = planInput("delete file readme.txt", settings, initialWorld());
  assert.equal(plan.steps[0]?.confirm?.includes("Delete"), true);
});

test("greeting stays on the fast path", () => {
  const plan = planInput("hello", settings, initialWorld());
  assert.equal(plan.via, "router");
  assert.equal(plan.steps.length, 0);
  assert.match(plan.reply ?? "", /model/i);
});

test("unknown text is the preview brain", () => {
  const plan = planInput("what is the capital of france", settings, initialWorld());
  assert.equal(plan.via, "model");
});

test("type lands in notepad", () => {
  let world = initialWorld();
  world = applyAction(world, { op: "open_app", app: "notepad" }).world;
  world = applyAction(world, { op: "type_text", text: "hello" }).world;
  const note = world.windows.find((win) => win.app === "notepad");
  assert.equal(note?.text, "hello");
});

test("shell asks and refuses a dangerous command", () => {
  const plan = planInput("run format C:", settings, initialWorld());
  assert.equal(plan.steps[0]?.action.op, "run_command");
  assert.ok(plan.steps[0]?.confirm);
  const result = applyAction(initialWorld(), { op: "run_command", command: "format C:" });
  assert.equal(result.ok, false);
});
