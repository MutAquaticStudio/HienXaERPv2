import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }));
import { DeclineJobButton } from "./decline-job-button";

const fetchMock = vi.fn();
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("asks for a reason, then hands the job back and returns to the list", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ declined: true }) });
  render(<DeclineJobButton workItemId="w1" version={3} />);
  fireEvent.click(screen.getByRole("button", { name: "Từ chối việc này" }));
  fireEvent.click(screen.getByRole("button", { name: "Gửi từ chối" }));
  expect(screen.getByRole("status")).toHaveTextContent("Ghi lý do từ chối");
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Lý do từ chối"), { target: { value: "Xe hỏng lốp" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi từ chối" }));
  await waitFor(() => expect(m.push).toHaveBeenCalledWith("/work?notice=work-declined"));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ workItemId: "w1", version: 3, reason: "Xe hỏng lốp" });
});

it("keeps the same operation after an unclear outcome so pressing again only checks", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Chưa gửi được.", unknown: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ declined: true }) });
  render(<DeclineJobButton workItemId="w1" version={3} />);
  fireEvent.click(screen.getByRole("button", { name: "Từ chối việc này" }));
  fireEvent.change(screen.getByLabelText("Lý do từ chối"), { target: { value: "Bận việc khác" } });
  fireEvent.click(screen.getByRole("button", { name: "Gửi từ chối" }));
  await screen.findByText("Chưa gửi được.");
  fireEvent.click(screen.getByRole("button", { name: "Gửi từ chối" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).operationId).toBe(JSON.parse(fetchMock.mock.calls[1][1].body).operationId);
});
