import { describe, expect, it } from "vitest";

import { formatPortalMoney } from "./money";
import {
  addDays, businessToday, estimateVnd, filterServices, flatServices, isOpenStage, matchReorder, quantityText, requestMeta, requestSubtitle, requestTitle,
  serviceRequestSteps, serviceStageLabel, serviceStageTone, shortDate, slotText, wishText, type CustomerServiceRequest, type PortalServiceCatalog,
} from "./service-request";

const catalog: Pick<PortalServiceCatalog, "groups"> = {
  groups: [
    { name: "Chạc", services: [
      { name: "Chạc gạch", options: [{ id: "xe", unit_label: "xe cn nhỏ", unit_price_vnd: "170000" }, { id: "to", unit_label: "xe cn to", unit_price_vnd: "340000" }] },
      { name: "Chạc rác", options: [{ id: "rac", unit_label: "xe cn to", unit_price_vnd: null }] },
    ] },
    { name: "Máy", services: [{ name: "Máy xúc", options: [{ id: "may", unit_label: "ca", unit_price_vnd: null }] }] },
  ],
};
const request = (fields: Partial<CustomerServiceRequest> = {}): CustomerServiceRequest => ({
  id: "r1", number: "YC-202611-000001", member_role: "OWNER", state: "SUBMITTED", stage: "SUBMITTED", service_name: "Chạc gạch", unit_label: "xe cn to", quantity: "2",
  site_name: "Công trình Q.7", site_address: "12 Nguyễn Văn Linh", preferred_date: "2026-11-15", preferred_slot: "MORNING", contact_name: "Anh Tuấn", contact_phone: "0901 234 567",
  submitted_at: "2026-11-14T10:20:00Z", can_cancel: true, unit_price_vnd: "340000", estimate_vnd: "680000", ...fields,
});

describe("service request wording (D75)", () => {
  it("words the wish, the quantity and the title as the concept does, with the unit of the service type", () => {
    expect(shortDate("2026-11-15")).toBe("15/11");
    expect(slotText("MORNING")).toBe("buổi sáng");
    expect(slotText("AFTERNOON")).toBe("buổi chiều");
    expect(slotText("TIME", "13:30")).toBe("lúc 13:30");
    expect(wishText(request())).toBe("Mong muốn 15/11, buổi sáng");
    expect(quantityText("2", "xe cn nhỏ")).toBe("2 xe cn nhỏ");
    expect(requestTitle(request())).toBe("Chạc gạch · 2 xe cn to");
    expect(requestSubtitle(request())).toBe("Mong muốn 15/11, buổi sáng · Công trình Q.7");
    expect(requestSubtitle(request({ stage: "SCHEDULED" }))).toBe("Công trình Q.7");
  });

  it("labels every stage in Vietnamese and keeps unknown ones readable", () => {
    for (const stage of ["SUBMITTED", "SCHEDULED", "IN_PROGRESS", "CONFIRMING", "DONE", "SCHEDULE_CANCELLED", "CANCELLED", "REJECTED"] as const) {
      expect(serviceStageLabel(stage)).toMatch(/[À-ỹĐđ]/u);
    }
    expect(serviceStageLabel("UNRECOGNIZED")).toBe("Đang cập nhật");
    expect(serviceStageLabel("constructor")).toBe("Đang cập nhật");
    expect(serviceStageTone("SUBMITTED")).toBe("warm");
    expect(serviceStageTone("DONE")).toBe("done");
    expect(serviceStageTone("REJECTED")).toBe("stopped");
    expect(isOpenStage("IN_PROGRESS")).toBe(true);
    expect(isOpenStage("DONE")).toBe(false);
  });

  it("estimates quantity × option price in whole đồng, half up, and shows no estimate without a price", () => {
    expect(estimateVnd("2", "340000")).toBe(680000n);
    expect(estimateVnd("2.5", "85001")).toBe(212503n);
    expect(estimateVnd("0.333333", "1000")).toBe(333n);
    expect(estimateVnd("2", null)).toBeNull();
    expect(estimateVnd("0", "1000")).toBeNull();
    expect(estimateVnd("1,5", "1000")).toBeNull();
  });

  it("works on the Vietnam business date whatever the device's zone", () => {
    // 18:00 UTC on 14/11 is already 01:00 on 15/11 in Ho Chi Minh City.
    expect(businessToday(new Date("2026-11-14T18:00:00Z"))).toBe("2026-11-15");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 120)).toBe("2027-04-30");
  });
});

describe("service catalog on the portal (D75)", () => {
  it("lists services under their group and finds them without accents or capitals", () => {
    expect(flatServices(catalog).map((entry) => `${entry.group}/${entry.name}`)).toEqual(["Chạc/Chạc gạch", "Chạc/Chạc rác", "Máy/Máy xúc"]);
    expect(filterServices(catalog, "chac gach").flatMap((group) => group.services.map((service) => service.name))).toEqual(["Chạc gạch"]);
    expect(filterServices(catalog, "MÁY").map((group) => group.name)).toEqual(["Máy"]);
    expect(filterServices(catalog, "chạc").flatMap((group) => group.services)).toHaveLength(2);
    expect(filterServices(catalog, "không có")).toEqual([]);
    expect(filterServices(catalog, "  ")).toBe(catalog.groups);
  });

  it("offers an earlier request again by name and unit, falling back to the first unit, and says so when the service is gone", () => {
    expect(matchReorder(catalog, { service_name: "chạc gạch", unit_label: "Xe cn to" })?.option.id).toBe("to");
    expect(matchReorder(catalog, { service_name: "Chạc gạch", unit_label: "tấn" })?.option.id).toBe("xe");
    expect(matchReorder(catalog, { service_name: "San móng", unit_label: "giờ" })).toBeNull();
  });
});

describe("tracking steps (D75)", () => {
  const states = (value: Partial<CustomerServiceRequest>) => serviceRequestSteps({ ...request(), ...value }).map((step) => `${step.key}:${step.state}`);
  it("moves through the five steps of the concept, one current step at a time", () => {
    expect(states({})).toEqual(["sent:done", "scheduled:current", "working:todo", "confirming:todo", "done:todo"]);
    expect(states({ stage: "SCHEDULED" })).toEqual(["sent:done", "scheduled:done", "working:current", "confirming:todo", "done:todo"]);
    expect(states({ stage: "IN_PROGRESS" })).toEqual(["sent:done", "scheduled:done", "working:current", "confirming:todo", "done:todo"]);
    expect(states({ stage: "CONFIRMING" })).toEqual(["sent:done", "scheduled:done", "working:done", "confirming:current", "done:todo"]);
    expect(states({ stage: "DONE" })).toEqual(["sent:done", "scheduled:done", "working:done", "confirming:done", "done:done"]);
  });

  it("says what the store will do while waiting, and the schedule once it is set", () => {
    expect(serviceRequestSteps(request())[1].hint).toContain("Cửa hàng sẽ báo giờ, xe hoặc máy và thợ phụ trách");
    expect(serviceRequestSteps(request({ stage: "SCHEDULED", scheduled_start: "2026-11-16T00:30:00Z" }))[1].hint).toBe("Lịch 16/11 lúc 07:30");
  });

  it("ends in one stopped step with the reason instead of promising steps that will not happen", () => {
    expect(serviceRequestSteps(request({ stage: "CANCELLED", decision_reason: "Đặt nhầm" })).map((step) => step.state)).toEqual(["done", "stopped"]);
    expect(serviceRequestSteps(request({ stage: "REJECTED", decision_reason: "Hết máy" })).at(-1)).toMatchObject({ state: "stopped", hint: "Lý do: Hết máy" });
    expect(serviceRequestSteps(request({ stage: "SCHEDULE_CANCELLED" })).map((step) => step.state)).toEqual(["done", "done", "stopped"]);
  });
});

describe("a request in a list (D75)", () => {
  it("shows the estimate or 'giá do cửa hàng báo' while open, and the final amount once it is in the debt", () => {
    expect(requestMeta(request(), formatPortalMoney)).toMatch(/^Gửi 17:20 · 14\/11 · Tạm tính 680\.000/);
    expect(requestMeta(request({ estimate_vnd: undefined }), formatPortalMoney)).toMatch(/giá do cửa hàng báo$/);
    expect(requestMeta(request({ stage: "SCHEDULED", scheduled_start: "2026-11-16T00:30:00Z", estimate_vnd: undefined }), formatPortalMoney)).toBe("16/11 lúc 07:30 · giá do cửa hàng báo");
    expect(requestMeta(request({ stage: "DONE", verified_at: "2026-11-08T05:00:00Z", final_amount_vnd: "340000" }), formatPortalMoney)).toMatch(/^08\/11 · Thành tiền 340\.000.* · đã ghi vào Công nợ$/);
  });

  it("never shows money to the receiver or for a request that stopped", () => {
    const receiver = requestMeta(request({ member_role: "RECEIVER", estimate_vnd: undefined, unit_price_vnd: undefined }), formatPortalMoney);
    expect(receiver).toBe("Gửi 17:20 · 14/11");
    expect(requestMeta(request({ member_role: "RECEIVER", stage: "DONE", verified_at: "2026-11-08T05:00:00Z" }), formatPortalMoney)).toBe("08/11");
    expect(requestMeta(request({ stage: "CANCELLED" }), formatPortalMoney)).toBe("Gửi 17:20 · 14/11");
  });
});
