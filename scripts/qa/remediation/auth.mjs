import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";

export async function realQAAuth(envPath, roles) {
  const env = parseEnv(await readFile(envPath, "utf8"));
  assert.equal(env.HX_QA_PROJECT_REF, "ffrwiglcrlumfvhubaxg");
  assert.equal(env.HX_QA_RUNTIME_APPROVED, "true");
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, "https://ffrwiglcrlumfvhubaxg.supabase.co");
  const accounts = {};
  for (const [role, email] of Object.entries(roles)) {
    const response = await fetch(env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1/token?grant_type=password", {
      method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password: env.HX_QA_PASSWORD }), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    assert.equal(response.status, 200, `Real QA Auth ${role} failed; credentials are not logged`);
    assert.ok(data.access_token);
    const claims = JSON.parse(Buffer.from(data.access_token.split(".")[1], "base64url"));
    assert.equal(claims.iss, env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1");
    assert.equal(claims.role, "authenticated");
    assert.equal(claims.sub, data.user.id);
    accounts[role] = { subject: data.user.id, token: data.access_token, email };
  }
  const api = async (role, resource, payload, tokenOverride) => {
    const response = await fetch("http://127.0.0.1:3108/rest/v1/" + resource, {
      method: payload === undefined ? "GET" : "POST",
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        authorization: "Bearer " + (tokenOverride ?? accounts[role].token), "content-type": "application/json" },
      body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(30000),
    });
    return { status: response.status, data: await response.json() };
  };
  return { accounts, api };
}
