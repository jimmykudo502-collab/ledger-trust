import { z } from "zod";

/** How all-numeric dates such as 01/05/2026 are written in an import. */
export const DATE_ORDERS = ["MDY", "DMY", "YMD"] as const;
export const dateOrderSchema = z.enum(DATE_ORDERS);
export type DateOrder = z.infer<typeof dateOrderSchema>;
