import "server-only";
import { connection } from "next/server";

// Capture one server instant after the request boundary; never use a browser clock.
export async function readPricingClock(): Promise<number> {
  await connection();
  return Date.now();
}
