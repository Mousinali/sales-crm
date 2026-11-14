export default function Brand() {
  return (
    <div className="flex items-center px-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed local brand asset, not a user-uploaded or remote image next/image would optimize. */}
      <img src="/logo/white-logo.svg" alt="Sales CRM" className="h-7 w-auto" />
    </div>
  );
}
