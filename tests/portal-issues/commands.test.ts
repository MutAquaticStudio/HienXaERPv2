import { describe, expect, it } from "vitest";

import { parsePortalIssueForm } from "@/modules/portal-issues/commands";

const sourceId = "72000000-0000-4000-8000-000000000002";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("WP1 portal issue validation", () => {
  it("accepts a preset issue linked to a real core source identifier", () => {
    expect(parsePortalIssueForm(form({
      sourceType: "DELIVERY",
      sourceId,
      category: "WRONG_ADDRESS",
      description: "Địa chỉ nhận hàng khác so với lộ trình đã giao.",
    }))).toEqual({
      kind: "portal.issue.report",
      sourceType: "DELIVERY",
      sourceId,
      category: "WRONG_ADDRESS",
      description: "Địa chỉ nhận hàng khác so với lộ trình đã giao.",
    });
  });

  it("rejects a short description and unrecognized categories", () => {
    expect(() => parsePortalIssueForm(form({
      sourceType: "DELIVERY",
      sourceId,
      category: "WRONG_ADDRESS",
      description: "ngắn",
    }))).toThrow(/ít nhất 10 ký tự/);
    expect(() => parsePortalIssueForm(form({
      sourceType: "DELIVERY",
      sourceId,
      category: "MARGIN_OVERRIDE",
      description: "Đây là mô tả đúng độ dài nhưng không hợp lệ.",
    }))).toThrow(/Loại sự cố không hợp lệ/);
  });
});
