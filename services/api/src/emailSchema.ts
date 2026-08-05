import { z } from 'zod';

/** Accepts normal emails plus `user@localhost` (Zod's email() rejects localhost). */
export const authEmailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine(
    (v) =>
      z.string().email().safeParse(v).success ||
      /^[^\s@]+@localhost$/i.test(v),
    'Invalid email',
  );
