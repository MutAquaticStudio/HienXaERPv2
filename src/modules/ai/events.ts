// FB14 (D36): the top bar's "Trợ lý AI" button asks to open the assistant; the contact bar answers on wide screens (where it
// is shown), the floating bubble on the others.
export const OPEN_AI_EVENT = "hx:open-ai";
export const CHAT_DOCK_QUERY = "(min-width: 1280px)";

/** Whether the contact bar is on screen (it is hidden on narrow screens and on the Tin nhắn page). */
export function chatDockVisible() {
  return typeof window !== "undefined" && !!document.querySelector(".chat-dock") && window.matchMedia(CHAT_DOCK_QUERY).matches;
}
