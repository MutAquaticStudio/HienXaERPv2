export function parseKeychainSecretResponse(response) {
  let payload;
  try {
    if (typeof response !== 'string') throw new Error();
    payload = JSON.parse(response);
  } catch {
    throw new Error('KEYCHAIN_INVALID_RESPONSE');
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object' || typeof payload.status !== 'number') {
    throw new Error('KEYCHAIN_INVALID_RESPONSE');
  }
  if (payload.status !== 0) throw new Error('KEYCHAIN_OPERATION_FAILED');
  if (typeof payload.secret !== 'string' || payload.secret.length === 0) throw new Error('KEYCHAIN_SECRET_MISSING');
  return payload.secret;
}
