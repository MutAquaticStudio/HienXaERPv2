/**
 * D97 (T-2): a browser's push address must be on a real push service (the same list as private.push_endpoint_allowed):
 * Chrome/Edge/Opera/Samsung (FCM), Firefox (Mozilla autopush), Windows (WNS) and Safari (Apple). The Android app uses its
 * Firebase token instead (saveAppPushTokenAction).
 */
const PUSH_ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)(:443)?\/\S*$/i;

export function isPushServiceEndpoint(value: string) {
  return value.length <= 1000 && PUSH_ENDPOINT.test(value);
}
