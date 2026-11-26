import { NextRequest, NextResponse } from "next/server";
import { directusFetch } from "../_lib";
import {
  extractEmployeePatch,
  patchEmployee,
  removeEmployeeFields,
} from "../../_shared/employee-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await directusFetch(`/items/salesman?limit=-1&sort=-modified_date`);
    return NextResponse.json({ data: r?.data ?? [] });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { message: err.message ?? "Failed to load salesmen." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload = body?.data;
    if (!payload) {
      return NextResponse.json({ message: "Missing body.data" }, { status: 400 });
    }

    // Employee contact/address columns do not exist on `salesman`; save them on the employee row.
    const employeePatch = extractEmployeePatch(payload);
    const employeeId = Number(payload.employee_id);

    if (Object.keys(employeePatch).length > 0 && !employeeId) {
      return NextResponse.json(
        { message: "employee_id is required to save employee address details." },
        { status: 400 },
      );
    }

    // Employee first: a failed address save must not leave a salesman row behind.
    await patchEmployee(employeeId, employeePatch);

    const salesmanPayload = { ...removeEmployeeFields(payload), inventory_day: null };

    const r = await directusFetch(`/items/salesman`, {
      method: "POST",
      body: JSON.stringify(salesmanPayload),
    });

    return NextResponse.json({ data: r?.data ?? r });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { message: err.message ?? "Failed to create salesman." },
      { status: 500 },
    );
  }
}
