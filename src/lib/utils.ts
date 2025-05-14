import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getCanonicalImagePath = (path: string): string => {
  // Standardize slashes to forward slashes, preserve original casing from input,
  // and normalize Unicode characters to NFC form.
  return path.replace(/\\/g, '/').normalize('NFC');
}
