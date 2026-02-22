import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * A utility function to conditionally join CSS class names together.
 * @param inputs - A list of class names.
 * @returns A merged string of class names.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- ADDED: Deterministic Random Number Generator ---
/**
 * Generates a deterministic random integer based on a string seed.
 * This ensures that the same item always shows the same "random" number.
 * @param {string} seed - A unique string for each item (e.g., template.id).
 * @param {number} min - The minimum number in the range.
 * @param {number} max - The maximum number in the range.
 * @returns {number} A consistent random number for the given seed.
 */
/**
 * Returns (or creates) a stable numeric seed for the current browser session.
 * A new seed is generated on each fresh session, so template order changes on every login.
 */
export function getSessionSeed(): number {
  const key = 'dhc_session_seed';
  const existing = sessionStorage.getItem(key);
  if (existing) return Number(existing);
  const seed = Math.floor(Math.random() * 1_000_000);
  sessionStorage.setItem(key, String(seed));
  return seed;
}

/**
 * Deterministic Fisher-Yates shuffle driven by a numeric seed.
 * Returns a new array — does not mutate the original.
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = Math.abs(s) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const getDeterministicRandom = (seed: string, min: number, max: number): number => {
  let hash = 0;
  // Simple hash function
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const range = max - min + 1;
  // Ensure the hash is positive and use modulo to get a number within the range
  const randomValue = (Math.abs(hash) % range) + min;
  
  return randomValue;
};