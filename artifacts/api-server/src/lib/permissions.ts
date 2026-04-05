import { z } from "zod";

export const permissionsSchema = z.object({
  editTemplates: z.boolean(),
  addInspectors: z.boolean(),
  createProjects: z.boolean(),
}).strict();

export type PermissionsData = z.infer<typeof permissionsSchema>;

export function validatePermissions(
  perms: unknown,
): { ok: true; data: PermissionsData } | { ok: false } {
  const result = permissionsSchema.safeParse(perms);
  if (!result.success) return { ok: false };
  return { ok: true, data: result.data };
}

export function parsePermissions(raw: string | null | undefined): PermissionsData {
  const defaults: PermissionsData = { editTemplates: false, addInspectors: false, createProjects: false };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    const result = validatePermissions(parsed);
    return result.ok ? result.data : defaults;
  } catch {
    return defaults;
  }
}

export const DEFAULT_PERMISSIONS = JSON.stringify({ editTemplates: false, addInspectors: false, createProjects: false });
