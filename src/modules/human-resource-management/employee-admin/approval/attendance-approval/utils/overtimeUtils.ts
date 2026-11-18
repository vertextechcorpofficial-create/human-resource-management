import type { AttendanceLogWithUser } from "../type";

/**
 * Parses time string (e.g. "17:00:00" or "17:00") into a Date object on the specified date string.
 */
export function timeToDate(dateStr: string, timeStr: string): Date {
  const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr.split(" ")[0];
  const [y, mm, d] = datePart.split("-").map(Number);
  const [h, m, s] = timeStr.split(":").map(Number);
  return new Date(y, (mm || 1) - 1, d || 1, h || 0, m || 0, Math.floor(s || 0));
}

/**
 * Parses an ISO or standard datetime string into a local Date object.
 */
export function parseLocalISO(isoStr: string): Date {
  if (!isoStr) return new Date();
  
  if (!isoStr.includes("T")) {
    if (isoStr.includes(" ")) {
      const [datePart, timePart] = isoStr.split(" ");
      const [y, mm, d] = datePart.split("-").map(Number);
      const [h, m, s] = timePart.split(":").map(Number);
      return new Date(y, (mm || 1) - 1, d || 1, h || 0, m || 0, Math.floor(s || 0));
    }
    return new Date(isoStr);
  }

  const [datePart, timePart] = isoStr.split("T");
  const [y, mm, d] = datePart.split("-").map(Number);
  const [h, m, s] = timePart.replace("Z", "").split(":").map(Number);
  return new Date(y, (mm || 1) - 1, d || 1, h || 0, m || 0, Math.floor(s || 0));
}

/**
 * Extracts total requested overtime duration in minutes from an attendance log.
 * Returns 0 if no OT request or if request was rejected / cancelled.
 */
export function getLogRequestedOtMinutes(log: AttendanceLogWithUser): number {
  if (!log.ot_request) return 0;
  
  const status = (log.ot_request.status || "").toLowerCase();
  if (status === "rejected" || status === "cancelled") return 0;

  if (log.ot_request.duration_minutes != null && Number(log.ot_request.duration_minutes) > 0) {
    return Number(log.ot_request.duration_minutes);
  }

  if (log.ot_request.ot_from && log.ot_request.ot_to && log.log_date) {
    try {
      const otStart = timeToDate(log.log_date, log.ot_request.ot_from);
      let otEnd = timeToDate(log.log_date, log.ot_request.ot_to);
      if (otEnd < otStart) {
        otEnd = new Date(otEnd.getTime() + 24 * 60 * 60 * 1000);
      }
      const diff = Math.floor((otEnd.getTime() - otStart.getTime()) / 60000);
      return diff > 0 ? diff : 0;
    } catch {
      return 0;
    }
  }

  return 0;
}

/**
 * Computes approved/credited overtime based on the computation of the actual time out
 * and the requested overtime duration/range, respecting minimum minutes and incremental step.
 *
 * Rules:
 * 1. Must have an OT request (approved status).
 * 2. Must have an actual time out.
 * 3. Overtime starts at ot_from (or sched_time_out if ot_from not specified).
 * 4. Actual overtime worked is the duration from OT start to actual time out.
 * 5. Minimum threshold: if actual worked OT < minOtMinutes, 0 is credited.
 * 6. Incremental step: if incrementalOtMinutes > 0, rounded down to nearest step.
 * 7. Credited overtime is capped by requested overtime.
 */
export function computeLogOvertimeMinutes(
  log: AttendanceLogWithUser,
  minOtMinutes = 30,
  incrementalOtMinutes = 30
): number {
  if (!log.ot_request) {
    return 0;
  }

  const otStatus = (log.ot_request.status || "").toLowerCase();
  if (otStatus !== "approved") {
    return 0;
  }

  // 1. Requested duration
  const requestedMins = getLogRequestedOtMinutes(log);
  if (requestedMins <= 0) {
    return 0;
  }

  // 2. Must have actual time out
  if (!log.time_out || !log.log_date) {
    return 0;
  }

  try {
    const actualOut = parseLocalISO(log.time_out);

    // 3. Determine overtime start time
    let otStart: Date;
    if (log.ot_request.ot_from) {
      otStart = timeToDate(log.log_date, log.ot_request.ot_from);
    } else if (log.sched_time_out) {
      otStart = timeToDate(log.log_date, log.sched_time_out);
    } else if (log.time_in) {
      const actualIn = parseLocalISO(log.time_in);
      otStart = new Date(actualIn.getTime() + 9 * 60 * 60000); // 8hrs work + 1hr break
    } else {
      return 0;
    }

    // Handle midnight crossing for actualOut
    if (log.time_in) {
      const actualIn = parseLocalISO(log.time_in);
      if (actualOut < actualIn) {
        actualOut.setTime(actualOut.getTime() + 24 * 60 * 60 * 1000);
      }
    } else if (actualOut < otStart) {
      const diffHours = (otStart.getTime() - actualOut.getTime()) / 3600000;
      if (diffHours > 12) {
        actualOut.setTime(actualOut.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    // If actual time out is at or before overtime start, 0 overtime
    if (actualOut <= otStart) {
      return 0;
    }

    const actualWorkedOtMins = Math.floor((actualOut.getTime() - otStart.getTime()) / 60000);

    // Enforce minimum overtime minutes threshold (default 30 mins)
    if (actualWorkedOtMins < minOtMinutes) {
      return 0;
    }

    // Enforce incremental overtime minutes (e.g. 30 mins increments)
    let creditedMins = actualWorkedOtMins;
    if (incrementalOtMinutes > 0) {
      creditedMins = Math.floor(actualWorkedOtMins / incrementalOtMinutes) * incrementalOtMinutes;
    }

    // Credited overtime is the actual worked overtime capped by the requested overtime
    return Math.max(0, Math.min(requestedMins, creditedMins));
  } catch {
    return 0;
  }
}

/**
 * Calculates how many minutes of the given interval [workStart, workEnd] fall within
 * the recurring night differential window [ndStartStr, ndEndStr] (e.g. 22:00 to 06:00).
 * Handles midnight rollover and excludes any overlapping unpaid break interval.
 */
export function calculateNightDiffMinutes(
  workStart: Date,
  workEnd: Date,
  breakStart?: Date | null,
  breakEnd?: Date | null,
  ndStartStr = "22:00",
  ndEndStr = "06:00"
): number {
  if (!workStart || !workEnd || workEnd <= workStart) return 0;

  const [sH, sM] = ndStartStr.split(":").map(Number);
  const [eH, eM] = ndEndStr.split(":").map(Number);

  let totalNdMs = 0;

  // Scan from 1 calendar day before workStart to 1 day after workEnd
  const cursor = new Date(workStart);
  cursor.setDate(cursor.getDate() - 1);
  cursor.setHours(0, 0, 0, 0);

  const maxDate = new Date(workEnd);
  maxDate.setDate(maxDate.getDate() + 1);

  while (cursor <= maxDate) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const d = cursor.getDate();

    const wStart = new Date(y, m, d, sH || 0, sM || 0, 0, 0);
    let wEnd: Date;
    if ((sH || 0) > (eH || 0) || ((sH || 0) === (eH || 0) && (sM || 0) >= (eM || 0))) {
      wEnd = new Date(y, m, d + 1, eH || 0, eM || 0, 0, 0);
    } else {
      wEnd = new Date(y, m, d, eH || 0, eM || 0, 0, 0);
    }

    const oStart = Math.max(workStart.getTime(), wStart.getTime());
    const oEnd = Math.min(workEnd.getTime(), wEnd.getTime());

    if (oEnd > oStart) {
      let segment = oEnd - oStart;

      if (breakStart && breakEnd && breakEnd > breakStart) {
        const bStart = Math.max(breakStart.getTime(), oStart);
        const bEnd = Math.min(breakEnd.getTime(), oEnd);
        if (bEnd > bStart) {
          segment -= (bEnd - bStart);
        }
      }

      totalNdMs += Math.max(0, segment);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.floor(totalNdMs / 60000);
}

/**
 * Computes night differential minutes for an attendance log based on scheduled/actual
 * working hours, subtracting any schedule break that falls in the night diff window.
 */
export function computeLogNightDiffMinutes(
  log: AttendanceLogWithUser,
  schedule?: {
    time_in?: string | null;
    time_out?: string | null;
    lunch_start?: string | null;
    lunch_end?: string | null;
  } | null,
  ndStartStr = "22:00",
  ndEndStr = "06:00"
): number {
  const workMinutes = log.work_minutes ?? 0;
  if (workMinutes <= 0 || !log.log_date) return 0;

  try {
    let workStart: Date | null = null;
    let workEnd: Date | null = null;

    if (log.time_in) {
      workStart = parseLocalISO(log.time_in);
    } else if (schedule?.time_in) {
      workStart = timeToDate(log.log_date, schedule.time_in);
    }

    if (log.time_out) {
      workEnd = parseLocalISO(log.time_out);
    } else if (schedule?.time_out) {
      workEnd = timeToDate(log.log_date, schedule.time_out);
    }

    if (!workStart) return 0;

    // Handle shift crossing midnight
    if (workEnd && workEnd < workStart) {
      workEnd = new Date(workEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // If workEnd is still missing or before workStart, default to workStart + workMinutes
    if (!workEnd || workEnd <= workStart) {
      workEnd = new Date(workStart.getTime() + workMinutes * 60000);
    }

    // Determine optional lunch break
    let bStart: Date | null = null;
    let bEnd: Date | null = null;
    if (schedule?.lunch_start && schedule?.lunch_end) {
      bStart = timeToDate(log.log_date, schedule.lunch_start);
      bEnd = timeToDate(log.log_date, schedule.lunch_end);
      if (workStart && bStart < workStart) {
        bStart = new Date(bStart.getTime() + 24 * 60 * 60 * 1000);
        bEnd = new Date(bEnd.getTime() + 24 * 60 * 60 * 1000);
      }
      if (bEnd < bStart) {
        bEnd = new Date(bEnd.getTime() + 24 * 60 * 60 * 1000);
      }
    }

    const ndMins = calculateNightDiffMinutes(workStart, workEnd, bStart, bEnd, ndStartStr, ndEndStr);
    return Math.max(0, Math.min(workMinutes, ndMins));
  } catch {
    return 0;
  }
}

/**
 * Computes regular hours (in minutes) by taking total work_minutes minus night_diff_minutes.
 */
export function computeLogRegularMinutes(
  log: AttendanceLogWithUser,
  schedule?: {
    time_in?: string | null;
    time_out?: string | null;
    lunch_start?: string | null;
    lunch_end?: string | null;
  } | null,
  ndStartStr = "22:00",
  ndEndStr = "06:00"
): number {
  const workMinutes = log.work_minutes ?? 0;
  if (workMinutes <= 0) return 0;

  const ndMinutes = log.night_diff_minutes !== undefined
    ? log.night_diff_minutes
    : computeLogNightDiffMinutes(log, schedule, ndStartStr, ndEndStr);

  return Math.max(0, workMinutes - ndMinutes);
}
