import { box, button, emailLayout, linkFallback, paragraph, spacer, strong } from "./layout";

/**
 * D62: the Supabase Auth emails in the Hiền Xa frame. The HTML is written to supabase/templates/<file> (checked by
 * auth-templates.test.ts) and pasted into Supabase → Authentication → Emails. Links stay {{ .ConfirmationURL }}, the
 * one Supabase builds, so sign-up confirmation and password recovery keep working exactly as with the default emails.
 */
export type AuthTemplate = {
  file: string;
  /** Where it goes in the Supabase dashboard. */
  dashboard: string;
  /** config.toml section for the local stack. */
  configKey: string;
  subject: string;
  html: string;
};

const LOGO = "{{ .SiteURL }}/api/company/logo";
const SITE = "{{ .SiteURL }}";
const frame = (subject: string, preheader: string, eyebrow: string, title: string, content: string) =>
  emailLayout({ subject, preheader, eyebrow, title, content, logoUrl: LOGO, siteLabel: SITE });

const CONFIRM_SUBJECT = "Xác nhận email để hoàn tất đăng ký Hiền Xa";
const RECOVERY_SUBJECT = "Đặt lại mật khẩu tài khoản Hiền Xa";
const PASSWORD_SUBJECT = "Mật khẩu tài khoản Hiền Xa vừa được đổi";
const EMAIL_SUBJECT = "Email đăng nhập Hiền Xa vừa được đổi";

export const AUTH_TEMPLATES: AuthTemplate[] = [
  { file: "confirmation.html", dashboard: "Emails → Templates → Confirm sign up", configKey: "auth.email.template.confirmation", subject: CONFIRM_SUBJECT,
    html: frame(CONFIRM_SUBJECT, "Bấm nút trong thư để kích hoạt tài khoản đặt hàng của bạn.", "Đăng ký tài khoản", "Xác nhận email của bạn",
      paragraph("Chào bạn,")
      + paragraph(`Bạn vừa đăng ký tài khoản khách hàng tại Hiền Xa bằng email ${strong("{{ .Email }}")}. Bấm nút dưới đây để xác nhận email và hoàn tất đăng ký.`)
      + button("Xác nhận email", "{{ .ConfirmationURL }}")
      + paragraph("Sau khi xác nhận, đăng nhập bằng email và mật khẩu bạn vừa tạo để đặt hàng, xem đơn và công nợ.")
      + box("Link chỉ dùng được một lần. Link hết hạn? Đăng ký lại bằng chính email này để nhận link mới.<br>Không phải bạn đăng ký? Bỏ qua email này, tài khoản sẽ không được kích hoạt.")
      + spacer() + linkFallback("{{ .ConfirmationURL }}")) },
  { file: "recovery.html", dashboard: "Emails → Templates → Reset password", configKey: "auth.email.template.recovery", subject: RECOVERY_SUBJECT,
    html: frame(RECOVERY_SUBJECT, "Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn.", "Bảo mật tài khoản", "Đặt mật khẩu mới",
      paragraph("Chào bạn,")
      + paragraph(`Hiền Xa vừa nhận yêu cầu đặt lại mật khẩu cho tài khoản ${strong("{{ .Email }}")}. Bấm nút dưới đây để chọn mật khẩu mới.`)
      + button("Đặt mật khẩu mới", "{{ .ConfirmationURL }}")
      + box("Không phải bạn yêu cầu? Bỏ qua email này, mật khẩu hiện tại vẫn dùng bình thường.<br>Link chỉ dùng được một lần; cần link mới thì bấm “Quên mật khẩu” lần nữa.")
      + spacer() + linkFallback("{{ .ConfirmationURL }}")) },
  { file: "password_changed_notification.html", dashboard: "Emails → Security notifications → Password changed", configKey: "auth.email.notification.password_changed", subject: PASSWORD_SUBJECT,
    html: frame(PASSWORD_SUBJECT, "Nếu không phải bạn đổi, hãy đặt lại mật khẩu ngay.", "Thông báo bảo mật", "Mật khẩu của bạn đã được đổi",
      paragraph(`Mật khẩu của tài khoản ${strong("{{ .Email }}")} vừa được đổi thành công. Nếu chính bạn vừa đổi, bạn không cần làm gì thêm.`)
      + box(`${strong("Không phải bạn đổi?")} Mở trang đăng nhập, bấm “Quên mật khẩu” để đặt mật khẩu mới, rồi báo cho cửa hàng qua Info@hienxavlxd.com.`, "warn")
      + button("Mở trang đăng nhập", SITE)) },
  { file: "email_changed_notification.html", dashboard: "Emails → Security notifications → Email address changed", configKey: "auth.email.notification.email_changed", subject: EMAIL_SUBJECT,
    html: frame(EMAIL_SUBJECT, "Email đăng nhập của tài khoản đã được đổi sang địa chỉ mới.", "Thông báo bảo mật", "Email đăng nhập đã được đổi",
      paragraph(`Email đăng nhập của tài khoản vừa được đổi từ ${strong("{{ .OldEmail }}")} sang ${strong("{{ .Email }}")}.`)
      + paragraph("Từ giờ, hãy đăng nhập bằng email mới.")
      + box(`${strong("Không phải bạn đổi?")} Báo ngay cho cửa hàng qua Info@hienxavlxd.com để được khóa tài khoản và lấy lại quyền truy cập.`, "warn")) },
];
