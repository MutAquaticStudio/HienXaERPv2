import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// jsdom has no layout, so this guards the CSS rules that keep the blue menu from overlapping (QA 02/11/2026:
// buttons shrank below their text at 1280–1600 px with the contacts panel open).
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const desktop = css.slice(css.indexOf("@media (min-width: 1180px) {\n  .main-menu { container"));

describe("menu chính trên màn rộng", () => {
  it("không cho nút menu co nhỏ hơn chữ và cho xuống dòng khi quá chật", () => {
    expect(desktop).toContain(".main-menu { container: main-menu / inline-size; }");
    expect(desktop).toContain(".nav-list > .nav-link, .nav-group { flex-shrink: 0; }");
    expect(desktop).toContain(".nav-list { flex-wrap: wrap; }");
  });

  it("ẩn biểu tượng nhóm rồi mũi tên khi thanh menu hẹp", () => {
    expect(desktop).toMatch(/@container main-menu \(max-width: 1500px\)[\s\S]*\.nav-group-toggle > svg:first-child \{ display: none; \}/);
    expect(desktop).toMatch(/@container main-menu \(max-width: 1200px\)[\s\S]*\.nav-group-toggle > \.nav-chevron \{ display: none; \}/);
  });
});
