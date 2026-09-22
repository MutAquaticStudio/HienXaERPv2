import { MessagingWorkspace } from "@/components/messaging/messaging-workspace";

export default function WorkMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MessagingWorkspace surface="work" searchParams={searchParams} />;
}
