import assert from "node:assert/strict";

// Only parameters declared json/jsonb by the candidate RPC use this contract:
// object/array/scalar values, or JSON text decoded once. Plain null is SQL NULL;
// JSON text "null" is JSON null. PostgreSQL arrays and ordinary text are untouched.
export function nativeRpcParameters(sql, values, typeOids) {
  assert.equal(values.length, typeOids.length, "RPC parameter types must match its supplied arguments");
  return values.map((value, index) => {
    if (![114, 3802].includes(Number(typeOids[index])) || value === null) return value;
    assert.notEqual(value, undefined, "JSON arguments must be explicit, including null");
    const document = typeof value === "string" ? JSON.parse(value) : value;
    // postgres-js treats a Parameter whose value is null as SQL NULL before
    // JSON serialization. Bind encoded JSON as text and cast at the SQL seam
    // so JSON null remains distinct and inferred JSON serializers cannot run.
    return sql.typed(JSON.stringify(document), 25);
  });
}

export function nativeRpcPlaceholders(typeOids) {
  return typeOids.map((type, index) => `$${index + 1}${Number(type) === 3802 ? "::jsonb" : Number(type) === 114 ? "::json" : ""}`);
}
