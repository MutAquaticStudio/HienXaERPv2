import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), remove: vi.fn(), session: vi.fn(), setAuth: vi.fn(), subscribe: vi.fn(),
  handlers: new Map<string, (payload: { extension?: string; status?: string }) => void>(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/modules/messaging/actions", () => ({ createConversationAction: vi.fn(), sendMessageAction: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: () => ({
  channel: () => {
    const channel = {
      on: (event: string, _filter: unknown, callback: (payload: { extension?: string; status?: string }) => void) => {
        mocks.handlers.set(event, callback); return channel;
      }, subscribe: () => { mocks.subscribe(); return channel; },
    };
    return channel;
  }, removeChannel: mocks.remove, auth: { getSession: mocks.session }, realtime: { setAuth: mocks.setAuth },
}) }));
import { MessageRefreshSignal } from "./messaging-controls";

beforeEach(() => {
  vi.clearAllMocks(); mocks.handlers.clear();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "test-session-jwt" } }, error: null });
  mocks.setAuth.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://qa.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
});
it("binds the restored JWT before subscribing and never joins anonymously", async () => {
  render(<MessageRefreshSignal conversationId="qa-conversation" />);
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledOnce());
  expect(mocks.setAuth).toHaveBeenCalledWith("test-session-jwt");
  expect(mocks.setAuth.mock.invocationCallOrder[0]).toBeLessThan(mocks.subscribe.mock.invocationCallOrder[0]);
  cleanup(); vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { session: null }, error: null });
  render(<MessageRefreshSignal conversationId="qa-conversation" />);
  await Promise.resolve(); await Promise.resolve();
  expect(mocks.subscribe).not.toHaveBeenCalled(); expect(mocks.setAuth).not.toHaveBeenCalled();
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it("queries persisted messages once the changes listener is ready, including reconnect", () => {
  render(<MessageRefreshSignal conversationId="qa-conversation" />);
  const system = mocks.handlers.get("system");
  expect(system).toBeDefined();
  system?.({ extension: "postgres_changes", status: "error" });
  expect(mocks.refresh).not.toHaveBeenCalled();
  system?.({ extension: "postgres_changes", status: "ok" });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  system?.({ extension: "postgres_changes", status: "ok" });
  expect(mocks.refresh).toHaveBeenCalledTimes(2);
});
it("refreshes on authorized insert and ignores events after cleanup", () => {
  const view = render(<MessageRefreshSignal conversationId="qa-conversation" />);
  const insert = mocks.handlers.get("postgres_changes");
  insert?.({}); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  view.unmount(); expect(mocks.remove).toHaveBeenCalledOnce();
  insert?.({}); expect(mocks.refresh).toHaveBeenCalledTimes(1);
});
it("queries missed messages and rebinds a new authenticated channel when the network returns", async () => {
  render(<MessageRefreshSignal conversationId="qa-conversation" />);
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new Event("online"));
  await waitFor(() => expect(mocks.subscribe).toHaveBeenCalledTimes(2));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.setAuth).toHaveBeenCalledTimes(2);
});
