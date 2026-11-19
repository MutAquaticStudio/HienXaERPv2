import { expect, it } from "vitest";
import { welcomeEmail } from "./welcome-email";

it("D62: escapes what the customer typed and links the portal and logo of this app", () => {
  const message = welcomeEmail({ name: "  <img src=x onerror=alert(1)>\n Cửa hàng \"Minh\" ", email: "minh@example.test", origin: "https://app.hienxavlxd.com" });
  expect(message.to).toBe("minh@example.test");
  expect(message.subject).toBe("Chào mừng bạn đến với Hiền Xa");
  expect(message.html).not.toContain("<img src=x");
  expect(message.html).toContain("Chào &lt;img src=x onerror=alert(1)&gt; Cửa hàng &quot;Minh&quot;, tài khoản của bạn đã sẵn sàng");
  expect(message.html).toContain('href="https://app.hienxavlxd.com/customer"');
  expect(message.html).toContain('src="https://app.hienxavlxd.com/api/company/logo"');
  expect(message.html).toContain("app.hienxavlxd.com<br>Cần hỗ trợ?");
  expect(message.html).not.toMatch(/<script|\{\{/);
  expect(message.text).toContain("Vào tài khoản: https://app.hienxavlxd.com/customer");
  expect(message.text).toContain("- Đặt hàng vật tư:");
});

it("greets a customer without a name as “bạn”", () => {
  expect(welcomeEmail({ name: "   ", email: "a@example.test", origin: "https://app.hienxavlxd.com" }).html).toContain("Chào bạn, tài khoản của bạn đã sẵn sàng");
});
