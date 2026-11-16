import { z } from "zod";

/**
 * D86: the Firebase (FCM) token of one phone with the Android app "Hiền Xa". Same rule as the database
 * (push_subscriptions_token_check); used by the server action, the sign-out route and the delivery route.
 */
export const appPushToken = z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:.-]+$/);

/** For logs: never the whole token, only its last characters. */
export function tokenHint(token: string): string {
  return `…${token.slice(-6)}`;
}
