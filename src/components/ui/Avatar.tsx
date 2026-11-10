import { initialsOf } from "./initials";
import { hashColor } from "./hashColor";

const DIMS = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-9 w-9 text-xs",
  lg: "h-20 w-20 text-xl",
};

export default function Avatar({
  name,
  imageUrl,
  size = "sm",
}: {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = DIMS[size];
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- user-uploaded data: URL, not a static asset next/image can optimize.
    return <img src={imageUrl} alt={name} className={`${dims} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span
      className={`inline-flex ${dims} shrink-0 items-center justify-center rounded-full font-semibold ${hashColor(name)}`}
    >
      {initialsOf(name)}
    </span>
  );
}
