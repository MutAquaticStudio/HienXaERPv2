import { expect, it } from "vitest";
import { displayLogin, isPhoneLogin, loginEmail, normalizePhone } from "./login-identifier";

it("turns a phone number into the internal sign-in name and shows it back as the phone", () => {
  expect(normalizePhone("0912 345 678")).toBe("0912345678");
  expect(normalizePhone("+84 912.345.678")).toBe("0912345678");
  expect(normalizePhone("84912345678")).toBe("0912345678");
  expect(normalizePhone("12345")).toBeNull();
  expect(loginEmail("0912 345 678")).toBe("0912345678@sdt.hienxavlxd.com");
  expect(loginEmail(" Chu@HienXa.VN ")).toBe("chu@hienxa.vn");
  expect(loginEmail("không phải")).toBeNull();
  expect(isPhoneLogin("0912345678@sdt.hienxavlxd.com")).toBe(true);
  expect(displayLogin("0912345678@sdt.hienxavlxd.com")).toBe("0912345678");
  expect(displayLogin("chu@hienxa.vn")).toBe("chu@hienxa.vn");
});
