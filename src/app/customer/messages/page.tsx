import { MessagingWorkspace } from "@/components/messaging/messaging-workspace";

export default function CustomerMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MessagingWorkspace surface="customer" searchParams={searchParams} />;
}
