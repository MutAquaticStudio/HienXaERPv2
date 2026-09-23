import { MessagingWorkspace } from "@/components/messaging/messaging-workspace";

export default function AdminMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MessagingWorkspace surface="admin" searchParams={searchParams} />;
}
