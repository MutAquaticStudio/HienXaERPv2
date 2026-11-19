import { box, button, emailLayout, escapeHtml, featureList, paragraph, strong } from "@/lib/email/layout";
import type { EmailMessage } from "@/lib/email/send";

const SUBJECT = "Chào mừng bạn đến với Hiền Xa";
const PREHEADER = "Tài khoản đã sẵn sàng: đặt hàng, xem đơn và công nợ ngay trên điện thoại.";
const FEATURES: [string, string][] = [
  ["Đặt hàng vật tư", "Chọn xi măng, cát, thép… và gửi đơn cho cửa hàng."],
  ["Theo dõi đơn và giao hàng", "Xem đơn đã đặt, trạng thái và lịch giao."],
  ["Xem công nợ, thanh toán bằng QR", "Biết còn nợ bao nhiêu và chuyển khoản đúng số tiền."],
];

/**
 * D62 "Đăng ký thành công": the welcome a self-registered customer gets once their customer record exists. The name is
 * what the customer typed at registration, so it is escaped before it enters the HTML (and trimmed to one line).
 */
export function welcomeEmail({ name, email, origin }: { name: string; email: string; origin: string }): EmailMessage {
  const plainName = name.replace(/\s+/g, " ").trim().slice(0, 160) || "bạn";
  const portal = `${origin}/customer`;
  const safeName = escapeHtml(plainName), safeEmail = escapeHtml(email), safePortal = escapeHtml(portal);
  const html = emailLayout({
    subject: SUBJECT, preheader: PREHEADER, eyebrow: "Đăng ký thành công", title: `Chào ${safeName}, tài khoản của bạn đã sẵn sàng`,
    logoUrl: escapeHtml(`${origin}/api/company/logo`), siteLabel: escapeHtml(new URL(origin).host),
    content: paragraph("Cảm ơn bạn đã đăng ký tài khoản khách hàng tại Hiền Xa. Từ nay bạn có thể:")
      + featureList(FEATURES)
      + button("Vào tài khoản", safePortal)
      + paragraph(`Đăng nhập bằng email ${strong(safeEmail)} và mật khẩu bạn đã tạo.`, "font-size:14px;")
      + box("Cần hỏi giá hay đặt gấp? Nhắn tin cho cửa hàng ngay trong tài khoản, hoặc trả lời email này."),
  });
  const text = [
    `Chào ${plainName}, tài khoản của bạn đã sẵn sàng.`,
    "Cảm ơn bạn đã đăng ký tài khoản khách hàng tại Hiền Xa. Từ nay bạn có thể:",
    FEATURES.map(([title, detail]) => `- ${title}: ${detail}`).join("\n"),
    `Vào tài khoản: ${portal}\nĐăng nhập bằng email ${email}.`,
    "Cần hỗ trợ? Nhắn tin cho cửa hàng trong tài khoản hoặc trả lời email này.\nCông ty TNHH Thương Mại Hiền Xa · Info@hienxavlxd.com",
  ].join("\n\n");
  return { to: email, subject: SUBJECT, html, text };
}
