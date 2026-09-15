import { z } from "zod";
import type { DatabaseRows } from "../db/database.types.ts";
export const uuid = z.uuid();
export const captureInput = z.object({
  id: uuid,
  space_id: uuid,
  text: z
    .string()
    .min(1)
    .max(100000)
    .refine((v) => v.trim().length > 0),
  captured_at: z.iso.datetime({ offset: true }),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }),
  occurred_on: z.iso.date().nullable(),
  no_ai: z.boolean(),
});
export type CaptureInput = z.infer<typeof captureInput>;
export type Memory = {
  id: string;
  space_id: string;
  owner_id: string;
  current_revision: number;
  captured_at: string;
  received_at: string;
  timezone: string;
  occurred_on: string | null;
  no_ai: boolean;
  deleted_at: string | null;
  processing_status: string;
  text: string;
};
export type Space = Pick<DatabaseRows["spaces"], "id" | "name">;
export type Profile = {
  owner_id: string;
  display_name: string;
  timezone: string;
  ai_consent: boolean;
  no_ai_default: boolean;
  default_space_id: string | null;
};
export const statement = z.object({
  text: z.string().max(1500),
  quote: z.string().min(1).max(3000),
  source_id: uuid,
});
export const extraction = z.object({
  title: z.string().max(160),
  events: z
    .array(
      z.object({
        title: z.string().max(160),
        state: z.enum(["happened", "planned", "cancelled"]),
        date: z.iso.date().nullable(),
        precision: z.enum(["day", "approximate", "unknown"]),
        quote: z.string().min(1),
      }),
    )
    .max(30),
  claims: z.array(statement).max(40),
  entities: z
    .array(
      z.object({
        name: z.string().max(160),
        kind: z.enum(["person", "organization", "project", "topic", "place"]),
        quote: z.string().min(1),
      }),
    )
    .max(30),
  commitments: z
    .array(
      z.object({
        description: z.string().max(1000),
        due_on: z.iso.date().nullable(),
        due_phrase: z.string().max(200).nullable(),
        direction: z.enum(["i_owe", "waiting_for", "idea"]),
        quote: z.string().min(1),
      }),
    )
    .max(30),
});
