import assert from "node:assert/strict";
import test from "node:test";
import { nativeRpcParameters, nativeRpcPlaceholders } from "./native-rpc-parameters.mjs";

const sql = { typed: (text, oid) => ({ text, oid }) };
test("only declared JSON parameters are decoded and typed", () => {
  const participants = ["a", "b"];
  const note = '{"ordinary":"text"}';
  assert.deepEqual(nativeRpcParameters(sql, [{ a: 1 }, '[1,2]', participants, note], [3802, 114, 2951, 25]),
    [{ text: '{"a":1}', oid: 25 }, { text: '[1,2]', oid: 25 }, participants, note]);
  assert.deepEqual(nativeRpcPlaceholders([3802, 114, 2951, 25]), ["$1::jsonb", "$2::json", "$3", "$4"]);
});
test("SQL NULL, JSON null, empty object/array and JSON string stay distinct", () => {
  assert.deepEqual(nativeRpcParameters(sql, [null, "null", {}, [], '"quoted"'], [3802, 3802, 3802, 3802, 3802]),
    [null, { text: "null", oid: 25 }, { text: "{}", oid: 25 }, { text: "[]", oid: 25 }, { text: '"quoted"', oid: 25 }]);
});
test("nested JSON and Vietnamese quotation marks survive one decode", () => {
  const document = { note: "Ti\u1ebfng Vi\u1ec7t \"\u0111\u00fang\"", lines: [{ quantity: "1.5", detail: { tags: ["a", "b"] } }] };
  assert.deepEqual(nativeRpcParameters(sql, [JSON.stringify(document)], [3802]), [{ text: JSON.stringify(document), oid: 25 }]);
});
test("invalid JSON text, omitted JSON and mismatched metadata fail closed", () => {
  assert.throws(() => nativeRpcParameters(sql, [""], [3802]), SyntaxError);
  assert.throws(() => nativeRpcParameters(sql, [undefined], [3802]));
  assert.throws(() => nativeRpcParameters(sql, [{}], []));
});
