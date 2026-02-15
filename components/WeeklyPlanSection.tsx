"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime, formatShortDate } from "@/lib/date";
import {
  WEEKLY_DAY_WORK_AREAS,
  type WeeklyDayWorkArea,
  type WeeklyPlan,
  type WeeklyPlanDailyUpdate,
  type WeeklyPlanInput
} from "@/lib/types";

type Props = {
  plans: WeeklyPlan[];
  onCreate: (input: WeeklyPlanInput) => void;
  onUpdate: (planId: string, input: WeeklyPlanInput) => void;
  onDelete: (planId: string) => void;
  onNotify: (title: string, message: string, variant?: "info" | "success" | "error") => void;
};

type PlanForm = {
  weekStartDate: string;
  weekEndDate: string;
};

type DayUpdateForm = {
  date: string;
  developerName: string;
  note: string;
  workArea: WeeklyDayWorkArea;
  spentHours: string;
  progressPercent: string;
  officeCheckIn: string;
  officeCheckOut: string;
};

const CORE_DEVELOPERS = ["Raihan", "Mainul", "Noman", "Imtiaz", "Mintu"] as const;
const OFFICE_START_TIME = "10:00";
const OFFICE_END_TIME = "19:00";

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function initialPlanForm(): PlanForm {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + diff);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return {
    weekStartDate: weekStart.toISOString().slice(0, 10),
    weekEndDate: weekEnd.toISOString().slice(0, 10)
  };
}

function initialDayUpdateForm(): DayUpdateForm {
  return {
    date: new Date().toISOString().slice(0, 10),
    developerName: "",
    note: "",
    workArea: "Frontend",
    spentHours: "",
    progressPercent: "",
    officeCheckIn: "",
    officeCheckOut: ""
  };
}

function toPlanInput(form: PlanForm, dailyUpdates: WeeklyPlanDailyUpdate[]): WeeklyPlanInput {
  return {
    weekStartDate: form.weekStartDate,
    weekEndDate: form.weekEndDate,
    dailyUpdates
  };
}

function sortDailyUpdatesByDateAsc(updates: WeeklyPlanDailyUpdate[]) {
  return [...updates].sort((a, b) => a.date.localeCompare(b.date));
}

function groupDailyUpdatesByDate(updates: WeeklyPlanDailyUpdate[]) {
  const sorted = sortDailyUpdatesByDateAsc(updates);
  const map = new Map<string, WeeklyPlanDailyUpdate[]>();
  for (const update of sorted) {
    const list = map.get(update.date) ?? [];
    list.push(update);
    map.set(update.date, list);
  }
  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getAttendanceStatus(checkIn?: string, checkOut?: string) {
  if (!checkIn && !checkOut) return "Not set";
  if (!checkIn || !checkOut) return "Incomplete";

  const isLate = checkIn > OFFICE_START_TIME;
  const leftEarly = checkOut < OFFICE_END_TIME;

  if (!isLate && !leftEarly) return "On time";
  if (isLate && leftEarly) return "Late + Early leave";
  if (isLate) return "Late";
  return "Early leave";
}

export default function WeeklyPlanSection({ plans, onCreate, onUpdate, onDelete, onNotify }: Props) {
  const PLANS_PER_PAGE = 10;

  const [planForm, setPlanForm] = useState<PlanForm>(() => initialPlanForm());
  const [dayUpdateForm, setDayUpdateForm] = useState<DayUpdateForm>(() => initialDayUpdateForm());
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingDayUpdateId, setEditingDayUpdateId] = useState<string | null>(null);
  const [draftDailyUpdates, setDraftDailyUpdates] = useState<WeeklyPlanDailyUpdate[]>([]);
  const [listPage, setListPage] = useState(1);
  const [activeView, setActiveView] = useState<"form" | "list" | "report">("form");
  const [reportMonth, setReportMonth] = useState<string>(() => currentMonthValue());

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate)),
    [plans]
  );
  const totalPages = Math.max(1, Math.ceil(sortedPlans.length / PLANS_PER_PAGE));
  const paginatedPlans = useMemo(() => {
    const page = Math.min(Math.max(listPage, 1), totalPages);
    const start = (page - 1) * PLANS_PER_PAGE;
    return sortedPlans.slice(start, start + PLANS_PER_PAGE);
  }, [sortedPlans, listPage, totalPages]);
  const monthlyReport = useMemo(() => {
    const monthPrefix = reportMonth;
    const coreNameByKey = new Map(CORE_DEVELOPERS.map((name) => [name.toLowerCase(), name]));
    const map = new Map<
      string,
      {
        developerName: string;
        totalUpdates: number;
        totalHours: number;
        progressSum: number;
        progressCount: number;
        completedDays: number;
        updates: WeeklyPlanDailyUpdate[];
      }
    >();

    for (const plan of plans) {
      for (const update of plan.dailyUpdates) {
        if (!update.date.startsWith(monthPrefix)) continue;
        const typedName = update.developerName.trim();
        const normalizedKey = typedName.toLowerCase();
        const canonicalName = coreNameByKey.get(normalizedKey) ?? typedName;
        const key = canonicalName.toLowerCase();
        if (!key) continue;
        const item = map.get(key) ?? {
          developerName: canonicalName,
          totalUpdates: 0,
          totalHours: 0,
          progressSum: 0,
          progressCount: 0,
          completedDays: 0,
          updates: []
        };
        item.totalUpdates += 1;
        item.totalHours += update.spentHours ?? 0;
        if (typeof update.progressPercent === "number") {
          item.progressSum += update.progressPercent;
          item.progressCount += 1;
          if (update.progressPercent >= 100) item.completedDays += 1;
        }
        item.updates.push(update);
        map.set(key, item);
      }
    }

    const rows = CORE_DEVELOPERS.map((developerName) => {
      const item = map.get(developerName.toLowerCase());
      if (!item) {
        return {
          developerName,
          totalUpdates: 0,
          totalHours: 0,
          avgProgress: 0,
          completedDays: 0,
          updates: [] as WeeklyPlanDailyUpdate[]
        };
      }
      return {
        ...item,
        avgProgress: item.progressCount > 0 ? item.progressSum / item.progressCount : 0
      };
    });

    const others = [...map.values()]
      .filter((item) => !coreNameByKey.has(item.developerName.toLowerCase()))
      .map((item) => ({
        ...item,
        avgProgress: item.progressCount > 0 ? item.progressSum / item.progressCount : 0
      }))
      .sort((a, b) => b.totalUpdates - a.totalUpdates);

    return {
      rows,
      others,
      allUpdatesCount: [...map.values()].reduce((sum, item) => sum + item.totalUpdates, 0),
      allHours: [...map.values()].reduce((sum, item) => sum + item.totalHours, 0)
    };
  }, [plans, reportMonth]);

  const monthlyReportText = useMemo(() => {
    const header = [
      `Monthly Developer Report (${reportMonth})`,
      `Team: ${CORE_DEVELOPERS.join(", ")}`,
      `Total Updates: ${monthlyReport.allUpdatesCount}`,
      `Total Hours: ${monthlyReport.allHours.toFixed(2)}h`
    ];

    const body = monthlyReport.rows.map((row) => {
      const summary = [
        `${row.developerName}:`,
        `- Updates: ${row.totalUpdates}`,
        `- Total Hours: ${row.totalHours.toFixed(2)}h`,
        `- Avg Completion: ${row.avgProgress.toFixed(1)}%`,
        `- 100% Completion Days: ${row.completedDays}`
      ];
      const dayWise = row.updates
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(
          (update) =>
            `  - ${update.date} | ${update.workArea} | ${update.spentHours ?? "-"}h | ${update.progressPercent ?? 0}% | ${update.note}`
        );
      if (dayWise.length === 0) summary.push("  - No updates in this month.");
      return [...summary, ...dayWise].join("\n");
    });

    const othersSection =
      monthlyReport.others.length > 0
        ? [
            "Other Contributors:",
            ...monthlyReport.others.map(
              (row) =>
                `- ${row.developerName}: ${row.totalUpdates} updates, ${row.totalHours.toFixed(2)}h, ${row.avgProgress.toFixed(1)}% avg`
            )
          ]
        : [];

    return [...header, "", ...body, ...(othersSection.length > 0 ? ["", ...othersSection] : [])].join("\n");
  }, [monthlyReport, reportMonth]);

  useEffect(() => {
    setListPage(1);
  }, [sortedPlans.length]);

  useEffect(() => {
    if (listPage > totalPages) setListPage(totalPages);
  }, [listPage, totalPages]);

  const resetForm = () => {
    setPlanForm(initialPlanForm());
    setDayUpdateForm(initialDayUpdateForm());
    setEditingDayUpdateId(null);
    setDraftDailyUpdates([]);
    setEditingPlanId(null);
  };

  const addDailyUpdate = () => {
    const note = dayUpdateForm.note.trim();
    const developerName = dayUpdateForm.developerName.trim();
    if (!dayUpdateForm.date || !developerName || !note) {
      onNotify("Validation", "Date, Developer Name, and update note are required.", "error");
      return;
    }

    const spentHoursRaw = dayUpdateForm.spentHours.trim();
    const spentHoursValue = spentHoursRaw ? Number(spentHoursRaw) : NaN;
    if (spentHoursRaw && (!Number.isFinite(spentHoursValue) || spentHoursValue < 0)) {
      onNotify("Validation", "Spent hours must be a valid non-negative number.", "error");
      return;
    }
    const progressRaw = dayUpdateForm.progressPercent.trim();
    const progressValue = progressRaw ? Number(progressRaw) : NaN;
    if (progressRaw && (!Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100)) {
      onNotify("Validation", "Completion percentage must be between 0 and 100.", "error");
      return;
    }
    const checkIn = dayUpdateForm.officeCheckIn.trim();
    const checkOut = dayUpdateForm.officeCheckOut.trim();
    if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
      onNotify("Validation", "Please provide both check-in and check-out times.", "error");
      return;
    }
    if (checkIn && checkOut && checkIn > checkOut) {
      onNotify("Validation", "Check-out time cannot be earlier than check-in time.", "error");
      return;
    }

    const entry: WeeklyPlanDailyUpdate = {
      id: editingDayUpdateId || createId(),
      date: dayUpdateForm.date,
      developerName,
      note,
      workArea: dayUpdateForm.workArea,
      spentHours: spentHoursRaw ? spentHoursValue : undefined,
      progressPercent: progressRaw ? progressValue : undefined,
      officeCheckIn: checkIn || undefined,
      officeCheckOut: checkOut || undefined,
      updatedAt: new Date().toISOString()
    };

    setDraftDailyUpdates((prev) => {
      const next =
        editingDayUpdateId !== null
          ? prev.map((item) => (item.id === editingDayUpdateId ? entry : item))
          : [entry, ...prev];
      return sortDailyUpdatesByDateAsc(next);
    });
    setEditingDayUpdateId(null);
    setDayUpdateForm((prev) => ({ ...initialDayUpdateForm(), workArea: prev.workArea }));
  };

  const removeDailyUpdate = (updateId: string) => {
    if (editingDayUpdateId === updateId) {
      setEditingDayUpdateId(null);
      setDayUpdateForm(initialDayUpdateForm());
    }
    setDraftDailyUpdates((prev) => prev.filter((item) => item.id !== updateId));
  };

  const startEditDailyUpdate = (update: WeeklyPlanDailyUpdate) => {
    setEditingDayUpdateId(update.id);
    setDayUpdateForm({
      date: update.date,
      developerName: update.developerName,
      note: update.note,
      workArea: update.workArea,
      spentHours: update.spentHours === undefined ? "" : String(update.spentHours),
      progressPercent: update.progressPercent === undefined ? "" : String(update.progressPercent),
      officeCheckIn: update.officeCheckIn ?? "",
      officeCheckOut: update.officeCheckOut ?? ""
    });
  };

  const cancelEditDailyUpdate = () => {
    setEditingDayUpdateId(null);
    setDayUpdateForm(initialDayUpdateForm());
  };

  const copyMonthlyReport = async () => {
    try {
      await navigator.clipboard.writeText(monthlyReportText);
      onNotify("Copied", "Monthly report text copied. Paste it to create your final report.", "success");
    } catch {
      onNotify("Copy Failed", "Clipboard access failed. Please copy from report view manually.", "error");
    }
  };

  const downloadDayPdf = (plan: WeeklyPlan, date: string, updates: WeeklyPlanDailyUpdate[]) => {
    if (updates.length === 0) {
      onNotify("No Data", "No day updates found for PDF export.", "error");
      return;
    }

    const rows = updates
      .map(
        (update, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${escapeHtml(update.developerName)}</td>
            <td>${escapeHtml(update.workArea)}</td>
            <td>${update.spentHours ?? "-"}</td>
            <td>${update.progressPercent ?? 0}%</td>
            <td>${escapeHtml(update.officeCheckIn ?? "-")}</td>
            <td>${escapeHtml(update.officeCheckOut ?? "-")}</td>
            <td>${escapeHtml(getAttendanceStatus(update.officeCheckIn, update.officeCheckOut))}</td>
            <td>${escapeHtml(update.note)}</td>
          </tr>
        `
      )
      .join("");

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Daily Report - ${escapeHtml(date)}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            :root {
              --ink: #17212b;
              --muted: #5b6877;
              --line: #d9e1ea;
              --head-bg: #f3f6fa;
              --brand: #1f6fb2;
              --brand-soft: #e9f2fb;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
              color: var(--ink);
              background: #ffffff;
              padding: 28px;
            }
            .sheet {
              border: 1px solid var(--line);
              border-radius: 14px;
              overflow: hidden;
            }
            .head {
              background: linear-gradient(120deg, var(--brand-soft), #ffffff);
              padding: 18px 20px;
              border-bottom: 1px solid var(--line);
            }
            h1 {
              margin: 0;
              font-size: 19px;
              letter-spacing: 0.02em;
            }
            .sub {
              margin-top: 6px;
              color: var(--muted);
              font-size: 12px;
            }
            .meta-grid {
              padding: 16px 20px 10px;
              display: grid;
              grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 10px;
            }
            .meta-card {
              border: 1px solid var(--line);
              border-radius: 10px;
              padding: 10px 12px;
              background: #fff;
            }
            .meta-card small {
              display: block;
              color: var(--muted);
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              margin-bottom: 4px;
            }
            .meta-card strong {
              font-size: 14px;
            }
            .table-wrap {
              padding: 6px 20px 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid var(--line);
              border-radius: 10px;
              overflow: hidden;
              table-layout: fixed;
            }
            th, td {
              border-bottom: 1px solid var(--line);
              padding: 9px 10px;
              text-align: left;
              vertical-align: top;
              font-size: 12.5px;
              word-wrap: break-word;
              overflow-wrap: anywhere;
            }
            th {
              background: var(--head-bg);
              color: #2a3a4c;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              white-space: normal;
              line-height: 1.35;
            }
            tbody tr:nth-child(even) td {
              background: #fbfdff;
            }
            .col-idx { width: 4%; }
            .col-dev { width: 9%; }
            .col-area { width: 8%; }
            .col-hours { width: 6%; }
            .col-progress { width: 7%; }
            .col-in { width: 8%; }
            .col-out { width: 8%; }
            .col-att { width: 10%; }
            .col-note { width: 40%; }
            .hint {
              margin-top: 14px;
              color: var(--muted);
              font-size: 11px;
              text-align: right;
            }
            .attendance-on-time { color: #1c7a42; font-weight: 600; }
            .attendance-late,
            .attendance-early,
            .attendance-mixed { color: #b15b00; font-weight: 600; }
            @media print { .hint { display: none; } }
            @media print {
              body { padding: 0; }
              .sheet { border: none; border-radius: 0; }
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <div class="head">
              <h1>Daily Work Report</h1>
              <div class="sub">Project Tracker • Product/Engineering Daily Summary</div>
            </div>
            <div class="meta-grid">
              <div class="meta-card">
                <small>Date</small>
                <strong>${escapeHtml(formatShortDate(date))}</strong>
              </div>
              <div class="meta-card">
                <small>Week Range</small>
                <strong>${escapeHtml(formatShortDate(plan.weekStartDate))} - ${escapeHtml(formatShortDate(plan.weekEndDate))}</strong>
              </div>
              <div class="meta-card">
                <small>Total Updates</small>
                <strong>${updates.length}</strong>
              </div>
              <div class="meta-card">
                <small>Office Hours</small>
                <strong>${OFFICE_START_TIME} - ${OFFICE_END_TIME}</strong>
              </div>
            </div>
            <div class="table-wrap">
              <table>
                <colgroup>
                  <col class="col-idx" />
                  <col class="col-dev" />
                  <col class="col-area" />
                  <col class="col-hours" />
                  <col class="col-progress" />
                  <col class="col-in" />
                  <col class="col-out" />
                  <col class="col-att" />
                  <col class="col-note" />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Developer</th>
                    <th>Work Area</th>
                    <th>Hours</th>
                    <th>Completion</th>
                    <th>Check-in</th>
                    <th>Check-out</th>
                    <th>Attendance</th>
                    <th>Update</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
              <p class="hint">Use Print → Save as PDF for archive/share.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const reportWindow = window.open("", "_blank", "noopener,noreferrer,width=1000,height=900");
    if (reportWindow) {
      reportWindow.document.open();
      reportWindow.document.write(html);
      reportWindow.document.close();
      reportWindow.focus();
      reportWindow.print();
      return;
    }

    // Fallback when popup is blocked: render into hidden iframe and print.
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!frameDoc || !iframe.contentWindow) {
      document.body.removeChild(iframe);
      onNotify("Print Failed", "Could not prepare print preview. Please allow popups and try again.", "error");
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1500);
    }, 150);
  };

  const savePlan = () => {
    if (!planForm.weekStartDate || !planForm.weekEndDate || planForm.weekStartDate > planForm.weekEndDate) {
      onNotify("Validation", "Valid week start/end dates are required.", "error");
      return;
    }

    const input = toPlanInput(planForm, draftDailyUpdates);

    if (editingPlanId) {
      onUpdate(editingPlanId, input);
    } else {
      onCreate(input);
    }

    resetForm();
    setActiveView("list");
  };

  const startEdit = (plan: WeeklyPlan) => {
    setEditingPlanId(plan.id);
    setPlanForm({
      weekStartDate: plan.weekStartDate,
      weekEndDate: plan.weekEndDate
    });
    setDraftDailyUpdates(sortDailyUpdatesByDateAsc(plan.dailyUpdates));
    setDayUpdateForm((prev) => ({ ...initialDayUpdateForm(), workArea: prev.workArea }));
    setActiveView("form");
  };

  return (
    <section className="card stack">
      <div className="row between gap">
        <div>
          <h2>Weekly Planner</h2>
          <small>Day-wise updates only (Super Admin).</small>
        </div>
        <span className="badge" data-approval="approved">
          Super Admin Only
        </span>
      </div>

      <div className="tab-header">
        <button
          type="button"
          className={activeView === "form" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveView("form")}
        >
          Plan Form
        </button>
        <button
          type="button"
          className={activeView === "list" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveView("list")}
        >
          Weekly List
        </button>
        <button
          type="button"
          className={activeView === "report" ? "tab-btn active" : "tab-btn"}
          onClick={() => setActiveView("report")}
        >
          Month Report
        </button>
      </div>

      {activeView === "form" ? (
        <>
          <div className="grid two">
            <label>
              Week Start Date
              <input
                type="date"
                value={planForm.weekStartDate}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, weekStartDate: e.target.value }))}
              />
            </label>
            <label>
              Week End Date
              <input
                type="date"
                value={planForm.weekEndDate}
                onChange={(e) => setPlanForm((prev) => ({ ...prev, weekEndDate: e.target.value }))}
              />
            </label>
          </div>

          {editingPlanId ? (
            <div className="weekly-plan-item">
              <strong>Editing Mode</strong>
              <p>
                You are editing: {formatShortDate(planForm.weekStartDate)} - {formatShortDate(planForm.weekEndDate)}
              </p>
            </div>
          ) : null}

          <section className="card stack">
            <div className="row between gap">
              <h3>Day-wise Update</h3>
              <small>{draftDailyUpdates.length} update(s)</small>
            </div>

            <div className="grid five">
              <label>
                Date
                <input
                  type="date"
                  value={dayUpdateForm.date}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </label>
              <label>
                Developer Name
                <input
                  list="weekly-dev-names"
                  value={dayUpdateForm.developerName}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, developerName: e.target.value }))}
                  placeholder="Raihan / Mainul / Noman"
                />
                <datalist id="weekly-dev-names">
                  {CORE_DEVELOPERS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
              <label>
                Work Area
                <select
                  value={dayUpdateForm.workArea}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, workArea: e.target.value as WeeklyDayWorkArea }))}
                >
                  {WEEKLY_DAY_WORK_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Time Spent (hours)
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={dayUpdateForm.spentHours}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, spentHours: e.target.value }))}
                  placeholder="Example: 2.5"
                />
              </label>
              <label>
                Completion (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={dayUpdateForm.progressPercent}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, progressPercent: e.target.value }))}
                  placeholder="0-100"
                />
              </label>
            </div>

            <div className="grid two">
              <label>
                Office Check-in
                <input
                  type="time"
                  value={dayUpdateForm.officeCheckIn}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, officeCheckIn: e.target.value }))}
                />
              </label>
              <label>
                Office Check-out
                <input
                  type="time"
                  value={dayUpdateForm.officeCheckOut}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, officeCheckOut: e.target.value }))}
                />
              </label>
            </div>

            <label>
              Update Note
              <textarea
                rows={4}
                value={dayUpdateForm.note}
                onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Write day-wise progress/update for this week plan..."
              />
            </label>

            <div className="row gap">
              <button type="button" onClick={addDailyUpdate}>
                {editingDayUpdateId ? "Update Day Update" : "Add Day Update"}
              </button>
              {editingDayUpdateId ? (
                <button type="button" className="secondary" onClick={cancelEditDailyUpdate}>
                  Cancel
                </button>
              ) : null}
            </div>

            {draftDailyUpdates.length > 0 ? (
              <div className="stack">
                {groupDailyUpdatesByDate(draftDailyUpdates).map((group) => (
                  <div key={group.date} className="weekly-plan-item">
                    <strong>{formatShortDate(group.date)}</strong>
                    <div className="stack">
                      {group.items.map((update) => (
                        <div key={update.id} className="compact-cell">
                          <div className="row between gap">
                            <div className="muted">
                              {update.developerName} | {update.workArea} | {update.spentHours ?? "-"}h | {update.progressPercent ?? 0}%
                            </div>
                            <div className="row gap">
                              <button type="button" className="danger" onClick={() => removeDailyUpdate(update.id)}>
                                Remove
                              </button>
                              <button type="button" className="secondary" onClick={() => startEditDailyUpdate(update)}>
                                Edit
                              </button>
                            </div>
                          </div>
                          <div className="muted">
                            Office: {update.officeCheckIn ?? "-"} - {update.officeCheckOut ?? "-"} |{" "}
                            {getAttendanceStatus(update.officeCheckIn, update.officeCheckOut)}
                          </div>
                          <div>{update.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No day-wise updates added yet.</p>
            )}
          </section>

          <div className="row gap">
            <button type="button" onClick={savePlan}>
              {editingPlanId ? "Update Weekly Plan" : "Create Weekly Plan"}
            </button>
            {editingPlanId ? (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {activeView === "list" ? (
        <div className="stack">
          <h3>Weekly Plan List</h3>
          {sortedPlans.length === 0 ? (
            <p className="muted">No weekly plans found.</p>
          ) : (
            <div className="stack">
              <div className="row between gap">
                <small className="muted">
                  Showing {paginatedPlans.length} of {sortedPlans.length} weekly plans
                </small>
                <div className="row gap">
                  <button
                    type="button"
                    className="secondary"
                    disabled={listPage <= 1}
                    onClick={() => setListPage((prev) => Math.max(prev - 1, 1))}
                  >
                    Prev
                  </button>
                  <small className="muted">
                    Page {listPage} / {totalPages}
                  </small>
                  <button
                    type="button"
                    className="secondary"
                    disabled={listPage >= totalPages}
                    onClick={() => setListPage((prev) => Math.min(prev + 1, totalPages))}
                  >
                    Next
                  </button>
                </div>
              </div>

              {paginatedPlans.map((plan) => (
                <article key={plan.id} className="weekly-plan-item">
                  <div className="row between gap">
                    <strong>
                      Week: {formatShortDate(plan.weekStartDate)} - {formatShortDate(plan.weekEndDate)}
                    </strong>
                    <div className="row gap">
                      <button type="button" className="secondary" onClick={() => startEdit(plan)}>
                        Edit
                      </button>
                      <button type="button" className="danger" onClick={() => onDelete(plan.id)}>
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="stack">
                    {plan.dailyUpdates.length > 0 ? (
                      groupDailyUpdatesByDate(plan.dailyUpdates).map((group) => (
                        <div key={`${plan.id}-${group.date}`} className="weekly-plan-item">
                          <div className="row between gap">
                            <strong>{formatShortDate(group.date)}</strong>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => downloadDayPdf(plan, group.date, group.items)}
                            >
                              Download PDF
                            </button>
                          </div>
                          <div className="stack">
                            {group.items.map((update) => (
                              <div key={update.id} className="compact-cell">
                                <div>
                                  {update.developerName} | {update.workArea} | {update.spentHours ?? "-"}h | {update.progressPercent ?? 0}%
                                </div>
                                <div className="muted">
                                  Office: {update.officeCheckIn ?? "-"} - {update.officeCheckOut ?? "-"} |{" "}
                                  {getAttendanceStatus(update.officeCheckIn, update.officeCheckOut)}
                                </div>
                                <div>{update.note}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">No day-wise updates in this week.</p>
                    )}
                  </div>

                  <small>Last Updated: {formatDateTime(plan.updatedAt)}</small>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activeView === "report" ? (
        <section className="card stack">
          <div className="row between gap">
            <h3>Month-End Report Snapshot</h3>
            <small>Developer report for Raihan, Mainul, Noman.</small>
          </div>
          <div className="row gap">
            <label>
              Month
              <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value || currentMonthValue())} />
            </label>
            <button type="button" className="secondary" onClick={copyMonthlyReport}>
              Copy Report Text
            </button>
          </div>
          <div className="grid three">
            <div className="compact-cell">
              <small>Total Updates</small>
              <strong>{monthlyReport.allUpdatesCount}</strong>
            </div>
            <div className="compact-cell">
              <small>Total Hours</small>
              <strong>{monthlyReport.allHours.toFixed(2)}h</strong>
            </div>
            <div className="compact-cell">
              <small>Month</small>
              <strong>{reportMonth}</strong>
            </div>
          </div>
          <div className="stack">
            {monthlyReport.rows.map((row) => (
              <div key={row.developerName} className="weekly-plan-item">
                <div className="row between gap">
                  <strong>{row.developerName}</strong>
                  <span className="badge">{row.avgProgress.toFixed(1)}% Avg</span>
                </div>
                <div className="grid three">
                  <div className="compact-cell">
                    <small>Total Updates</small>
                    <strong>{row.totalUpdates}</strong>
                  </div>
                  <div className="compact-cell">
                    <small>Total Hours</small>
                    <strong>{row.totalHours.toFixed(2)}h</strong>
                  </div>
                  <div className="compact-cell">
                    <small>100% Days</small>
                    <strong>{row.completedDays}</strong>
                  </div>
                </div>
                <div className="stack">
                  {row.updates.length > 0 ? (
                    row.updates
                      .slice()
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((update) => (
                        <div key={update.id} className="compact-cell">
                          <div>
                            {formatShortDate(update.date)} | {update.workArea} | {update.spentHours ?? "-"}h | {update.progressPercent ?? 0}%
                          </div>
                          <div>{update.note}</div>
                        </div>
                      ))
                  ) : (
                    <small className="muted">No updates in this month.</small>
                  )}
                </div>
              </div>
            ))}
          </div>
          {monthlyReport.others.length > 0 ? (
            <div className="stack">
              <h4>Other Contributors</h4>
              {monthlyReport.others.map((row) => (
                <div key={row.developerName} className="compact-cell">
                  {row.developerName}: {row.totalUpdates} update(s), {row.totalHours.toFixed(2)}h, {row.avgProgress.toFixed(1)}% avg
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
