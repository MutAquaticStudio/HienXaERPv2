import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ load: vi.fn(), finish: vi.fn() }));
vi.mock("./actions", () => ({ loadAiCatalogFormAction: m.load, finishAiCatalogActionAction: m.finish }));
vi.mock("@/modules/catalog/catalog-dialog", () => ({
  CatalogDialog: (props: { kind: string; initial: Record<string, string>; operationId: string; onSaved(saved: { id: string; message: string }): void; onCreated?(saved: { id: string; message: string }): void }) => (
    <div role="dialog" aria-label={`Thêm ${props.kind}`}>
      <output>{props.initial.name ?? props.initial.address_text}</output><output data-testid="op">{props.operationId}</output>
      <button type="button" onClick={() => { props.onCreated?.({ id: props.operationId, message: "ok" }); props.onSaved({ id: props.operationId, message: "ok" }); }}>Lưu thay đổi</button>
    </div>),
}));
import { CatalogActionDialog } from "./catalog-action-dialog";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const base = { id: "11111111-1111-4111-8111-111111111111", title: "Tạo", state: "PENDING" as const, link: null, message: null, summary: [] };
const form = (kind: string, initial: Record<string, string>, operationId: string) => ({ ok: true, form: { kind, title: kind, options: {}, permissions: [], scope: "s", initial, operationId } });

it("D65: a supplier opens the real form with the card's operation id; saving marks the card done and closes", async () => {
  m.load.mockResolvedValue(form("suppliers", { name: "NCC An Phát" }, base.id));
  m.finish.mockResolvedValue({ ok: true, message: "ok", card: { ...base, state: "DONE" } });
  const onDone = vi.fn(); const onClose = vi.fn();
  render(<CatalogActionDialog card={{ ...base, catalog: { kind: "suppliers", title: "Nhà cung cấp", site: false } }} onClose={onClose} onDone={onDone} />);
  expect(await screen.findByText("NCC An Phát")).toBeInTheDocument();
  expect(screen.getByTestId("op")).toHaveTextContent(base.id);
  fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(m.finish).toHaveBeenCalledWith({ actionId: base.id });
  expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ state: "DONE" }));
});

it("D65: a new customer with an address goes on to the first-site form, and a material stays open for its units", async () => {
  const siteOp = "22222222-2222-4222-8222-222222222222";
  m.load.mockImplementation(async (input: { site?: boolean }) => input.site ? form("sites", { address_text: "12 Lê Lợi" }, siteOp) : form("customers", { name: "Khách An" }, base.id));
  m.finish.mockResolvedValue({ ok: true, message: "ok", card: { ...base, state: "DONE" } });
  const onClose = vi.fn();
  render(<CatalogActionDialog card={{ ...base, catalog: { kind: "customers", title: "Khách hàng", site: true } }} onClose={onClose} onDone={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Lưu thay đổi" }));
  expect(await screen.findByText("12 Lê Lợi")).toBeInTheDocument();
  expect(screen.getByTestId("op")).toHaveTextContent(siteOp);
  expect(onClose).not.toHaveBeenCalled();
  cleanup();
  m.load.mockResolvedValue(form("materials", { name: "Gạch" }, base.id));
  render(<CatalogActionDialog card={{ ...base, catalog: { kind: "materials", title: "Vật tư", site: false } }} onClose={onClose} onDone={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Lưu thay đổi" }));
  await waitFor(() => expect(m.finish).toHaveBeenCalledTimes(2));
  expect(onClose).not.toHaveBeenCalled();
});

it("shows a refusal to open the form instead of an empty popup", async () => {
  m.load.mockResolvedValue({ ok: false, message: "Bạn không có quyền thêm bản ghi này." });
  render(<CatalogActionDialog card={{ ...base, catalog: { kind: "suppliers", title: "Nhà cung cấp", site: false } }} onClose={vi.fn()} onDone={vi.fn()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("không có quyền");
});
