import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATES } from "./auth-templates";

const DIR = join(process.cwd(), "supabase", "templates");
const REQUIRED: Record<string, string[]> = {
  "confirmation.html": ["{{ .TokenHash }}", "{{ .SiteURL }}/auth/confirm?token_hash=", "{{ .Email }}", "{{ .SiteURL }}"],
  "recovery.html": ["{{ .TokenHash }}", "{{ .RedirectTo }}", "/recovery/confirm?token_hash=", "{{ .Email }}"],
  "password_changed_notification.html": ["{{ .Email }}", "{{ .SiteURL }}"],
  "email_changed_notification.html": ["{{ .OldEmail }}", "{{ .Email }}"],
};

// HX_WRITE_EMAIL_TEMPLATES=1 pnpm vitest run src/lib/email/auth-templates.test.ts regenerates the files after a change.
if (process.env.HX_WRITE_EMAIL_TEMPLATES === "1") {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  for (const template of AUTH_TEMPLATES) writeFileSync(join(DIR, template.file), template.html);
}

describe("Supabase Auth email templates (D62)", () => {
  it.each(AUTH_TEMPLATES.map((template) => [template.file, template] as const))("%s matches the committed file and is safe to paste", (file, template) => {
    expect(readFileSync(join(DIR, file), "utf8")).toBe(template.html);
    for (const variable of REQUIRED[file]) expect(template.html).toContain(variable);
    expect(template.html).not.toMatch(/<script|javascript:|\{\{\s*\.Data|http:\/\//i);
    expect(template.html).toContain('lang="vi"');
    expect(template.subject).toMatch(/[À-ỹĐđ]/u);
    expect(template.html).toContain("{{ .SiteURL }}/api/company/logo");
  });

  it("D67: the confirmation and recovery links never show a Supabase address", () => {
    for (const file of ["confirmation.html", "recovery.html"]) {
      const html = AUTH_TEMPLATES.find((template) => template.file === file)!.html;
      expect(html, file).not.toContain("{{ .ConfirmationURL }}");
      expect(html, file).not.toMatch(/supabase\.co/i);
    }
  });

  it("covers the four emails the Owner chose, each declared in the local config", () => {
    expect(AUTH_TEMPLATES.map((template) => template.file)).toEqual(Object.keys(REQUIRED));
    const config = readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8");
    for (const template of AUTH_TEMPLATES) {
      expect(config).toContain(`[${template.configKey}]`);
      expect(config).toContain(`content_path = "./supabase/templates/${template.file}"`);
      expect(config).toContain(`subject = "${template.subject}"`);
    }
  });
});
