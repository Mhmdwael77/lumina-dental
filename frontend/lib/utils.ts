type ClassValue = string | number | null | false | undefined;

/**
 * Lightweight className joiner (dependency-free).
 * Filters falsy values and joins the rest with a space.
 */
export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
