import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertLocalOrigin, daySpan, loadQaEnv, parseArgs, parseVnd, sumVnd } from "./support.mjs";

const qaEnv = ["HX_QA_PROJECT_REF=ffrwiglcrlumfvhubaxg", "HX_QA_RUNTIME_APPROVED=true", "NEXT_PUBLIC_SUPABASE_URL=https://ffrwiglcrlumfvhubaxg.supabase.co", "HX_QA_PASSWORD=x"];
async function envFile(lines) {
  const path = join(await mkdtemp(join(tmpdir(), "hx-fb-")), ".env.qa.local");
  await writeFile(path, lines.join("\n"));
  return path;
}

test("accepts only the approved QA project and never Production", async () => {
  assert.equal((await loadQaEnv(await envFile(qaEnv))).qa.ref, "ffrwiglcrlumfvhubaxg");
  await assert.rejects(loadQaEnv(await envFile([...qaEnv, "DATABASE_URL=postgres://postgres@db.nbwynrwkdbtfsitafsxa.supabase.co/postgres"])), /Production/);
  await assert.rejects(loadQaEnv(await envFile(qaEnv.map((line) => line.replace("=true", "=false")))), /QA approval/);
  const withoutPassword = qaEnv.filter((line) => !line.startsWith("HX_QA_PASSWORD"));
  await assert.rejects(loadQaEnv(await envFile(withoutPassword), {}), /HX_QA_PASSWORD/);
  assert.equal((await loadQaEnv(await envFile(withoutPassword), { HX_QA_PASSWORD: "from-env" })).env.HX_QA_PASSWORD, "from-env");
  assert.equal((await loadQaEnv(await envFile(qaEnv), { HX_QA_PASSWORD: "from-env" })).env.HX_QA_PASSWORD, "x");
  await assert.rejects(loadQaEnv(undefined), /--env/);
});

test("drives only a local app server", () => {
  assert.equal(assertLocalOrigin("http://127.0.0.1:3112/"), "http://127.0.0.1:3112");
  assert.throws(() => assertLocalOrigin("https://hien-xa.vercel.app"), /local/);
});

test("parses arguments and case lists", () => {
  assert.deepEqual(parseArgs(["--env", "e", "--only", "b06, b11", "--writes"]), { env: "e", only: "b06, b11", writes: true, cases: ["B06", "B11"] });
  assert.throws(() => parseArgs(["--env"]), /Thiếu giá trị/);
});

test("reads exact VND amounts and never turns a gap into 0", () => {
  assert.equal(parseVnd("1.234.567 ₫"), 1234567n);
  assert.equal(parseVnd("-50 ₫"), -50n);
  assert.equal(parseVnd("+8.000 ₫"), 8000n);
  assert.equal(parseVnd("0 ₫"), 0n);
  assert.equal(parseVnd("—"), null);
  assert.equal(parseVnd("Chưa đủ dữ liệu"), null);
  assert.equal(parseVnd("x1.000"), null);
  assert.equal(parseVnd("−1.000"), -1000n);
  assert.equal(sumVnd(["1.000 ₫", "-250 ₫"]), 750n);
  assert.equal(sumVnd(["1.000 ₫", "—"]), null);
  assert.equal(daySpan("2026-10-01", "2026-10-16"), 15);
});
