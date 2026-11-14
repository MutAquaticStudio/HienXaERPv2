import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  saveTransportPayRateAction: vi.fn(), saveServicePayRateAction: vi.fn(), saveSalaryProfileAction: vi.fn(), savePayrollComponentAction: vi.fn(),
  savePayrollHolidayAction: vi.fn(), createPayrollAction: vi.fn(), recalculatePayrollAction: vi.fn(), closePayrollAction: vi.fn(), cancelPayrollAction: vi.fn(),
  adjustPayrollLineAction: vi.fn(),
}));
import { ServiceRateForm, TransportRateForm } from "./forms";

afterEach(cleanup);
const active = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)).active;

it("sends 'off' when a work rate is unticked, so stopping it really stops paying it (D76)", () => {
  render(<TransportRateForm materials={[{ id: "m1", code: "XM", name: "Xi măng", units: [{ id: "u1", symbol: "bao" }] }]}
    rate={{ id: "r1", material_id: "m1", uom_id: "u1", rate_vnd: "2000", active: true }} />);
  const box = screen.getByRole("checkbox", { name: "Đang áp dụng" });
  const form = box.closest("form")!;
  expect(active(form)).toBe("on");
  fireEvent.click(box);
  expect(active(form)).toBe("off");
});

it("does the same for a service rate, and a new rate has no box at all", () => {
  render(<ServiceRateForm serviceTypes={[{ id: "s1", code: "CHAC", name: "Chạc", unit_label: "Xe cn nhỏ" }]}
    rate={{ id: "r2", service_type_id: "s1", rate_vnd: "50000", rate_bps: null, active: true }} />);
  const box = screen.getByRole("checkbox", { name: "Đang áp dụng" });
  fireEvent.click(box);
  expect(active(box.closest("form")!)).toBe("off");
  cleanup();
  render(<ServiceRateForm serviceTypes={[{ id: "s1", code: "CHAC", name: "Chạc", unit_label: "Xe cn nhỏ" }]} />);
  expect(screen.queryByRole("checkbox", { name: "Đang áp dụng" })).not.toBeInTheDocument();
});
