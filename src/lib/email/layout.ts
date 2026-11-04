/**
 * D62: the Hiền Xa email frame (concept approved by the Owner on 04/11/2026), shared by the Supabase Auth templates in
 * supabase/templates/ and the emails the app sends itself (the customer welcome). Tables and inline styles only, so it
 * reads the same in Gmail, Outlook and phone mail apps; a dark-mode block for the clients that honour it.
 *
 * Every builder takes HTML that is already safe: escape anything a person typed with `escapeHtml` first. The Supabase
 * templates insert only Supabase's own variables ({{ .Email }}, {{ .ConfirmationURL }}…), never user-entered text.
 */
export const EMAIL_COLORS = {
  page: "#f3f1ec", card: "#ffffff", ink: "#1d2b3f", body: "#3c4656", muted: "#6f7684", bronze: "#9a6d38", rule: "#b8894f",
  note: "#f7f2ea", warn: "#fbeeea", warnInk: "#8f2f1d", button: "#1d2b3f",
} as const;
const C = EMAIL_COLORS;
const FONT = "'Be Vietnam Pro', Arial, Helvetica, sans-serif";
const DARK = "body,.bg{background:#13171d!important}.card{background:#1d232c!important}.h1,.strong{color:#f1f3f6!important}.p{color:#c5cbd4!important}"
  + ".eyebrow{color:#d6aa6c!important}.btn{background:#d6aa6c!important}.btn a{color:#13171d!important}.note{background:#262d37!important}.note p{color:#c5cbd4!important}"
  + ".warn{background:#3a2621!important}.warn p{color:#f1c4b8!important}.link{color:#d6aa6c!important}.foot{color:#8d95a2!important}.list td{color:#c5cbd4!important}";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export const paragraph = (html: string, extra = "") =>
  `<p class="p" style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${C.body};${extra}">${html}</p>`;
export const strong = (html: string) => `<strong class="strong" style="color:${C.ink};">${html}</strong>`;
export const button = (label: string, url: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 20px;"><tr><td class="btn" style="border-radius:8px;background:${C.button};">
<a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`;
export const linkFallback = (url: string) => paragraph(`Nút không bấm được? Mở link sau trên trình duyệt:<br><a class="link" href="${url}" style="color:${C.bronze};word-break:break-all;">${url}</a>`,
  `font-size:13px;color:${C.muted};`);
export const box = (html: string, kind: "note" | "warn" = "note") => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 0;"><tr><td class="${kind}" style="background:${kind === "warn" ? C.warn : C.note};border-radius:8px;padding:14px 16px;">
<p style="margin:0;font-size:13.5px;line-height:1.6;color:${kind === "warn" ? C.warnInk : C.body};">${html}</p></td></tr></table>`;
export const spacer = (height = 14) => `<div style="height:${height}px;line-height:${height}px;">&nbsp;</div>`;
export const featureList = (rows: [title: string, detail: string][]) => `<table role="presentation" class="list" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px;">${rows.map(([title, detail]) => `<tr>
<td width="18" valign="top" style="padding:9px 0 0;"><div style="width:8px;height:8px;border-radius:2px;background:${C.rule};"></div></td>
<td style="padding:4px 0 8px;font-size:15px;line-height:1.5;color:${C.body};">${strong(title)}<br><span style="font-size:14px;">${detail}</span></td></tr>`).join("")}</table>`;

export type EmailFrame = {
  subject: string;
  /** The grey line mail apps show after the subject. */
  preheader: string;
  eyebrow: string;
  title: string;
  content: string;
  /** Absolute address of the logo image (…/api/company/logo). */
  logoUrl: string;
  /** Address printed in the footer, e.g. app.hienxavlxd.com. */
  siteLabel: string;
};

export function emailLayout({ subject, preheader, eyebrow, title, content, logoUrl, siteLabel }: EmailFrame): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${subject}</title>
<style>body{margin:0;padding:0;}@media (max-width:620px){.card{padding:28px 22px!important}.h1{font-size:22px!important}}@media (prefers-color-scheme:dark){${DARK}}</style></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};">
<tr><td style="padding:0 2px 16px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="background:#ffffff;border-radius:12px;padding:6px;"><img src="${logoUrl}" width="52" height="52" alt="Hiền Xa" style="display:block;border:0;"></td>
<td style="padding-left:12px;font-size:13px;line-height:1.4;color:${C.muted};" class="foot">Công ty TNHH Thương Mại Hiền Xa<br>Vật liệu xây dựng</td></tr></table></td></tr>
<tr><td class="card" style="background:${C.card};border-radius:12px;border-top:4px solid ${C.rule};padding:34px 36px 30px;">
<p class="eyebrow" style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.bronze};">${eyebrow}</p>
<h1 class="h1" style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${C.ink};">${title}</h1>
${content}
</td></tr>
<tr><td class="foot" style="padding:20px 10px 0;font-size:12px;line-height:1.7;color:${C.muted};text-align:center;">
Công ty TNHH Thương Mại Hiền Xa<br>Info@hienxavlxd.com · ${siteLabel}<br>Cần hỗ trợ? Trả lời email này để gặp cửa hàng.</td></tr>
</table></td></tr></table></body></html>
`;
}
