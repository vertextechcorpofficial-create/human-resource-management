/**
 * Salesman forms edit the employee's own contact/address details together with the salesman row,
 * but those columns live on `user`, not on `salesman`. Forwarding them to /items/salesman makes
 * Directus reject the whole write ("You don't have permission to access fields ..."), so every
 * salesman route splits them out first and patches the employee separately.
 */

const EMPLOYEE_FIELDS = [
  "user_email",
  "user_contact",
  "user_province",
  "user_city",
  "user_brgy",
] as const;

export type EmployeeField = (typeof EMPLOYEE_FIELDS)[number];

export type EmployeePatch = Partial<Record<EmployeeField, string | null>>;

export function extractEmployeePatch(body: Record<string, unknown>): EmployeePatch {
  const patch: EmployeePatch = {};

  for (const field of EMPLOYEE_FIELDS) {
    if (field in body && body[field] !== undefined) {
      patch[field] = (body[field] as string | null) || "";
    }
  }

  return patch;
}

export function removeEmployeeFields(body: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...body };

  for (const field of EMPLOYEE_FIELDS) {
    delete rest[field];
  }

  return rest;
}

export async function patchEmployee(employeeId: number, patch: EmployeePatch): Promise<void> {
  // Avoid a noisy PATCH when nothing was provided
  if (Object.keys(patch).length === 0) return;

  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not defined in environment variables");
  }

  const res = await fetch(`${baseUrl}/items/user/${employeeId}`, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${process.env.DIRECTUS_STATIC_TOKEN ?? ""}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "Unknown error");
    console.error("[sales-management] Failed to update employee user:", errorText);
    throw new Error("Failed to update employee details");
  }
}
