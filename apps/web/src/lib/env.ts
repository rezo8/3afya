/**
 * Browser-visible config. Only VITE_*-prefixed vars exist here.
 * In dev, VITE_API_URL is empty: the Vite proxy serves /api same-origin so the
 * auth cookies work without CORS. In prod, set it to the absolute API origin.
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? "",
} as const;
