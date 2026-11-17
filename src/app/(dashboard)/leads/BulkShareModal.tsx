"use client";

import { useEffect, useState, type FormEvent } from "react";
import Modal from "@/components/ui/Modal";
import MultiSelectSearch from "@/components/ui/MultiSelectSearch";
import { formatRoleLabel } from "@/app/(dashboard)/roleDisplay";
import { parseErrorMessage } from "@/lib/parseErrorMessage";
import { toast } from "@/lib/toast";

type Person = { id: number; name: string; description: string };

// Roles that can be given view access to a lead (see shareLead on the server).
const SHAREABLE_ROLES = ["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"];

// Shares the selected leads with the chosen people (view-only). The server
// still requires the sharer to own every selected lead.
export default function BulkShareModal({
  leadIds,
  viewerId,
  onClose,
  onDone,
}: {
  leadIds: number[];
  viewerId?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/users/roster")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((body: { users?: { id: number; name: string; role: string }[] }) =>
        setPeople(
          (body.users ?? [])
            .filter((u) => u.id !== viewerId && SHAREABLE_ROLES.includes(u.role))
            .map((u) => ({ id: u.id, name: u.name, description: formatRoleLabel(u.role) })),
        ),
      )
      .catch(() => {});
  }, [viewerId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected.length === 0) {
      setError("Choose at least one person.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/leads/share-bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadIds, userIds: selected }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Could not share the selected leads.", {
          403: "You can only share leads you own.",
        });
        setError(message);
        toast.error("Could not share leads", message);
        setSubmitting(false);
        return;
      }
      toast.success(`${leadIds.length} lead${leadIds.length === 1 ? "" : "s"} shared with ${selected.length} ${selected.length === 1 ? "person" : "people"}`);
      onDone();
    } catch {
      setError("Could not share the selected leads.");
      toast.error("Could not share leads");
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Share ${leadIds.length} lead${leadIds.length === 1 ? "" : "s"}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-zinc-500">They can view these leads (and their sales and payments), but not edit them.</p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bulkSharePeople" className="text-sm font-medium text-zinc-700">
            Share with
          </label>
          <MultiSelectSearch
            id="bulkSharePeople"
            options={people}
            selectedIds={selected}
            onChange={setSelected}
            placeholder="Search people…"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-400">
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Sharing…" : "Share"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
