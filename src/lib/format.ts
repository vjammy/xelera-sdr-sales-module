import { format } from "date-fns";

export function formatDate(value: Date | string | null | undefined, pattern = "MMM d, yyyy") {
  if (!value) {
    return "Not set";
  }

  return format(new Date(value), pattern);
}

export function titleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
