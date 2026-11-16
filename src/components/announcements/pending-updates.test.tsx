import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/modules/announcements/server", () => ({ loadPendingAnnouncements: m.load }));
vi.mock("@/components/announcements/update-popup", () => ({
  UpdatePopup: ({ items, surface, home }: { items: unknown[]; surface: string; home: string }) => <p>{`${items.length} ${surface} ${home}`}</p>,
}));
import { PendingUpdates } from "./pending-updates";

afterEach(cleanup);

it("reads this portal's pending announcements once and hands them to the popup", async () => {
  m.load.mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);
  render(await PendingUpdates({ surface: "WORKER", home: "/work" }) ?? <></>);
  expect(m.load).toHaveBeenCalledWith("WORKER");
  expect(screen.getByText("2 WORKER /work")).toBeInTheDocument();
});

it("renders nothing when there is nothing to show (or it could not be read)", async () => {
  m.load.mockResolvedValueOnce([]);
  expect(await PendingUpdates({ surface: "CUSTOMER", home: "/customer" })).toBeNull();
});
