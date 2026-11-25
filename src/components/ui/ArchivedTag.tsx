import Badge from "./Badge";

// Flags a sale/payment whose company was deleted (its lead archived), so the
// list makes clear the record belongs to an archived company.
export default function ArchivedTag() {
  return (
    <span title="Company deleted" className="ml-1.5 align-middle">
      <Badge icon="ri-archive-line" className="bg-amber-50 text-amber-700">
        Archived
      </Badge>
    </span>
  );
}
