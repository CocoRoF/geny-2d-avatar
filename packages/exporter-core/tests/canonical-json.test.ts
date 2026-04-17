import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "../src/util/canonical-json.js";

test("canonicalJson: keys are sorted alphabetically", () => {
  const out = canonicalJson({ b: 1, a: 2, c: 3 });
  assert.equal(out, '{\n  "a": 2,\n  "b": 1,\n  "c": 3\n}\n');
});

test("canonicalJson: nested objects are recursively sorted, arrays preserve order", () => {
  const out = canonicalJson({
    z: { y: 1, x: [{ b: 1, a: 2 }, { d: 1, c: 2 }] },
    a: null,
  });
  const expected = [
    "{",
    '  "a": null,',
    '  "z": {',
    '    "x": [',
    "      {",
    '        "a": 2,',
    '        "b": 1',
    "      },",
    "      {",
    '        "c": 2,',
    '        "d": 1',
    "      }",
    "    ],",
    '    "y": 1',
    "  }",
    "}",
    "",
  ].join("\n");
  assert.equal(out, expected);
});

test("canonicalJson: trailing LF and indent are exact", () => {
  const out = canonicalJson({ k: "v" });
  assert.ok(out.endsWith("\n"));
  assert.equal(out.split("\n").length, 4); // {\n  "k": "v"\n}\n → split 4
  assert.equal(out, '{\n  "k": "v"\n}\n');
});

test("canonicalJson: non-ASCII keys sort by byte order (no locale)", () => {
  const out = canonicalJson({ "한글": 1, "A": 2, "b": 3 });
  const parsed = JSON.parse(out) as Record<string, number>;
  const keys = Object.keys(parsed);
  assert.deepEqual(keys, ["A", "b", "한글"]);
});
