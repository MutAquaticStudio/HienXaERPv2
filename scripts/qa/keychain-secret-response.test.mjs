import assert from 'node:assert/strict';
import test from 'node:test';
import { parseKeychainSecretResponse } from './keychain-secret-response.mjs';

test('success extracts only the secret payload', () => {
  assert.equal(parseKeychainSecretResponse(JSON.stringify({ status: 0, secret: 'fixture_only_value', metadata: 'ignored' })), 'fixture_only_value');
});
test('success status metadata is not a secret', () => {
  assert.throws(() => parseKeychainSecretResponse('{"status":0}'), /KEYCHAIN_SECRET_MISSING/);
});
test('missing, empty and nonstring payloads fail closed', () => {
  for (const secret of [null, '', 123, {}]) assert.throws(() => parseKeychainSecretResponse(JSON.stringify({ status: 0, secret })), /KEYCHAIN_SECRET_MISSING/);
});
test('malformed response and invalid metadata types fail closed', () => {
  for (const raw of ['{', 'null', '[]', '{"status":"0","secret":"fixture_only"}']) assert.throws(() => parseKeychainSecretResponse(raw), /KEYCHAIN_INVALID_RESPONSE/);
});
test('nonzero operation status never returns a payload', () => {
  assert.throws(() => parseKeychainSecretResponse('{"status":-50,"secret":"fixture_only"}'), /KEYCHAIN_OPERATION_FAILED/);
});
test('JSON-like secret characters and whitespace remain unchanged', () => {
  const secret = '  {"status":-50,"secret":"literal_fixture"}  ';
  assert.equal(parseKeychainSecretResponse(JSON.stringify({ status: 0, secret })), secret);
});
