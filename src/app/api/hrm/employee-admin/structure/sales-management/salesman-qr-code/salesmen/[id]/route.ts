import { NextRequest, NextResponse } from "next/server";
import { directusFetch } from "../../_lib";
import {
  extractEmployeePatch,
  patchEmployee,
  removeEmployeeFields,
} from "../../../_shared/employee-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;

    const body = await req.json();
    const payload = body?.data;

    if (!payload) {
      return NextResponse.json({ message: "Missing body.data" }, { status: 400 });
    }

    // Employee contact/address columns do not exist on `salesman`; save them on the employee row.
    const employeePatch = extractEmployeePatch(payload);

    if (Object.keys(employeePatch).length > 0) {
      let employeeId = Number(payload.employee_id);

      // An edit that only touches the address still has to reach the right employee.
      if (!employeeId) {
        const existing = await directusFetch(`/items/salesman/${id}?fields=employee_id`);
        employeeId = Number(existing?.data?.employee_id ?? 0);
      }

      if (!employeeId) {
        return NextResponse.json(
          { message: "This salesman has no linked employee, so the address cannot be saved." },
          { status: 400 },
        );
      }

      // Employee first: a failed address save must not report success for the salesman row.
      await patchEmployee(employeeId, employeePatch);
    }

    const salesmanPayload = { ...removeEmployeeFields(payload), inventory_day: null };

    const r = await directusFetch(`/items/salesman/${id}`, {
      method: "PATCH",
      body: JSON.stringify(salesmanPayload),
    });

    return NextResponse.json({ data: r?.data ?? r });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { message: err.message ?? "Failed to update salesman." },
      { status: 500 },
    );
  }
}
