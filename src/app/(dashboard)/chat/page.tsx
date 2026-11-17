import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listConversations } from "@/lib/chat/crud";
import { listGroups } from "@/lib/chat/groups";
import PageHeading from "@/components/ui/PageHeading";
import ChatView from "./ChatView";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const user = await requireUser();
  const [conversations, groups] = await Promise.all([listConversations(pool, user.id), listGroups(pool, user.id)]);
  const { with: withParam } = await searchParams;
  const initialSelectedId = Number(withParam);

  return (
    <div>
      <PageHeading title="Chat" crumbs={[{ label: "Chat" }]} />
      <ChatView
        viewerId={user.id}
        initialConversations={conversations.map((c) => ({ ...c, last_at: c.last_at.toISOString() }))}
        initialGroups={groups.map((g) => ({ ...g, last_at: g.last_at.toISOString() }))}
        initialSelectedId={Number.isInteger(initialSelectedId) ? initialSelectedId : null}
      />
    </div>
  );
}
