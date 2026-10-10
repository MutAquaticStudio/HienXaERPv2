import { operationalPostingError } from "@/lib/core/errors";
export function earningCommandError(error: { code?: string; message?: string }) {
  const postingError = operationalPostingError(error.message);
  if (postingError) return postingError;
  if (error.code === "PT409" || error.code === "23505") return "Ngu\u1ed3n thu nh\u1eadp \u0111\u00e3 \u0111\u01b0\u1ee3c ghi nh\u1eadn ho\u1eb7c thao t\u00e1c xung \u0111\u1ed9t. H\u00e3y t\u1ea3i l\u1ea1i \u0111\u1ec3 xem l\u1ecbch s\u1eed.";
  if (error.code === "42501") return "B\u1ea1n kh\u00f4ng c\u00f3 quy\u1ec1n th\u1ef1c hi\u1ec7n thao t\u00e1c thu nh\u1eadp n\u00e0y.";
  if (error.code === "22023" || error.code === "23514" || error.code === "55000") return "Ngu\u1ed3n, quy t\u1eafc ho\u1eb7c tr\u1ea1ng th\u00e1i ghi nh\u1eadn ch\u01b0a h\u1ee3p l\u1ec7. Thu nh\u1eadp t\u1ef1 \u0111\u1ed9ng ch\u1ec9 ghi khi s\u1ef1 ki\u1ec7n ngu\u1ed3n ho\u00e0n t\u1ea5t.";
  return "Kh\u00f4ng th\u1ec3 ghi nh\u1eadn thu nh\u1eadp. Vui l\u00f2ng th\u1eed l\u1ea1i ho\u1eb7c li\u00ean h\u1ec7 qu\u1ea3n tr\u1ecb vi\u00ean.";
}
