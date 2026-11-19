import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SendToCustomerZalo } from "./send-to-customer";

describe("D51 Gửi qua Zalo", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("on a computer copies the text and opens the customer's Zalo chat; the app sends nothing itself", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<SendToCustomerZalo label="Gửi xác nhận đơn qua Zalo" text={"Xác nhận đơn SO-1"} zaloUrl="https://zalo.me/0912345678" />);
    fireEvent.click(screen.getByRole("button", { name: "Gửi xác nhận đơn qua Zalo" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Xác nhận đơn SO-1"));
    expect(open).toHaveBeenCalledWith("https://zalo.me/0912345678", "_blank", "noopener");
    expect(await screen.findByRole("status")).toHaveTextContent(/Đã chép nội dung.*Dán vào khung chat Zalo của khách/);
  });

  it("says how to add the phone number when the customer has no Zalo mobile number", () => {
    render(<SendToCustomerZalo label="Nhắc nợ qua Zalo" text="Nợ" zaloUrl={null} />);
    expect(screen.getByText(/Khách chưa có số di động dùng Zalo/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Mở Zalo khách" })).toBeNull();
  });
});
