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
  projectName: string;
  morningPlan: string;
  eveningUpdate: string;
  hasBlocker: boolean;
  blockerDetails: string;
  hasPendingWork: boolean;
  pendingWorkDetails: string;
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
    projectName: "",
    morningPlan: "",
    eveningUpdate: "",
    hasBlocker: false,
    blockerDetails: "",
    hasPendingWork: false,
    pendingWorkDetails: "",
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

function groupDailyUpdatesByDeveloper(updates: WeeklyPlanDailyUpdate[]) {
  const map = new Map<string, { developerName: string; items: WeeklyPlanDailyUpdate[] }>();
  for (const update of updates) {
    const key = update.developerName.trim().toLowerCase();
    const current = map.get(key) ?? { developerName: update.developerName, items: [] };
    current.items.push(update);
    map.set(key, current);
  }
  return [...map.values()];
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
  const DAY_GROUPS_PER_PAGE = 1;

  const [planForm, setPlanForm] = useState<PlanForm>(() => initialPlanForm());
  const [dayUpdateForm, setDayUpdateForm] = useState<DayUpdateForm>(() => initialDayUpdateForm());
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editingDayUpdateId, setEditingDayUpdateId] = useState<string | null>(null);
  const [editingDayUpdateForm, setEditingDayUpdateForm] = useState<DayUpdateForm>(() => initialDayUpdateForm());
  const [isDayEditModalOpen, setIsDayEditModalOpen] = useState(false);
  const [draftDailyUpdates, setDraftDailyUpdates] = useState<WeeklyPlanDailyUpdate[]>([]);
  const [listPage, setListPage] = useState(1);
  const [draftDayPage, setDraftDayPage] = useState(1);
  const [planDayPages, setPlanDayPages] = useState<Record<string, number>>({});
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
  const draftDayGroups = useMemo(() => groupDailyUpdatesByDate(draftDailyUpdates), [draftDailyUpdates]);
  const draftDayTotalPages = Math.max(1, Math.ceil(draftDayGroups.length / DAY_GROUPS_PER_PAGE));
  const paginatedDraftDayGroups = useMemo(() => {
    const page = Math.min(Math.max(draftDayPage, 1), draftDayTotalPages);
    const start = (page - 1) * DAY_GROUPS_PER_PAGE;
    return draftDayGroups.slice(start, start + DAY_GROUPS_PER_PAGE);
  }, [draftDayGroups, draftDayPage, draftDayTotalPages]);
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
            `  - ${update.date} | ${update.projectName ?? "-"} | ${update.workArea} | ${update.spentHours ?? "-"}h | ${update.progressPercent ?? 0}% | Morning: ${update.morningPlan ?? "-"} | Evening: ${update.eveningUpdate ?? update.note ?? "-"} | Blocker: ${update.hasBlocker ? (update.blockerDetails ?? "Yes") : "No"} | Pending: ${update.hasPendingWork ? (update.pendingWorkDetails ?? "Yes") : "No"}`
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

  useEffect(() => {
    if (draftDayPage > draftDayTotalPages) setDraftDayPage(draftDayTotalPages);
  }, [draftDayPage, draftDayTotalPages]);

  const resetForm = () => {
    setPlanForm(initialPlanForm());
    setDayUpdateForm(initialDayUpdateForm());
    setEditingDayUpdateId(null);
    setEditingDayUpdateForm(initialDayUpdateForm());
    setIsDayEditModalOpen(false);
    setDraftDailyUpdates([]);
    setDraftDayPage(1);
    setEditingPlanId(null);
  };

  const upsertDailyUpdate = (form: DayUpdateForm, targetId?: string) => {
    const morningPlan = form.morningPlan.trim();
    const eveningUpdate = form.eveningUpdate.trim();
    const developerName = form.developerName.trim();
    const projectName = form.projectName.trim();
    if (!form.date || !developerName || !projectName || !morningPlan) {
      onNotify("Validation", "Date, Developer Name, Project Name, and Morning Scrum Assignment are required.", "error");
      return false;
    }

    const spentHoursRaw = form.spentHours.trim();
    const spentHoursValue = spentHoursRaw ? Number(spentHoursRaw) : NaN;
    if (spentHoursRaw && (!Number.isFinite(spentHoursValue) || spentHoursValue < 0)) {
      onNotify("Validation", "Spent hours must be a valid non-negative number.", "error");
      return false;
    }
    const progressRaw = form.progressPercent.trim();
    const progressValue = progressRaw ? Number(progressRaw) : NaN;
    if (progressRaw && (!Number.isFinite(progressValue) || progressValue < 0 || progressValue > 100)) {
      onNotify("Validation", "Completion percentage must be between 0 and 100.", "error");
      return false;
    }
    const checkIn = form.officeCheckIn.trim();
    const checkOut = form.officeCheckOut.trim();
    if ((checkIn && !checkOut) || (!checkIn && checkOut)) {
      onNotify("Validation", "Please provide both check-in and check-out times.", "error");
      return false;
    }
    if (checkIn && checkOut && checkIn > checkOut) {
      onNotify("Validation", "Check-out time cannot be earlier than check-in time.", "error");
      return false;
    }
    if (form.hasBlocker && !form.blockerDetails.trim()) {
      onNotify("Validation", "Please write blocker details or choose No Blocker.", "error");
      return false;
    }
    if (form.hasPendingWork && !form.pendingWorkDetails.trim()) {
      onNotify("Validation", "Please write pending work details or choose No Pending Work.", "error");
      return false;
    }

    const entry: WeeklyPlanDailyUpdate = {
      id: targetId || createId(),
      date: form.date,
      developerName,
      projectName,
      note: eveningUpdate || morningPlan,
      morningPlan,
      eveningUpdate: eveningUpdate || undefined,
      hasBlocker: form.hasBlocker,
      blockerDetails: form.hasBlocker ? form.blockerDetails.trim() : undefined,
      hasPendingWork: form.hasPendingWork,
      pendingWorkDetails: form.hasPendingWork ? form.pendingWorkDetails.trim() : undefined,
      workArea: form.workArea,
      spentHours: spentHoursRaw ? spentHoursValue : undefined,
      progressPercent: progressRaw ? progressValue : undefined,
      officeCheckIn: checkIn || undefined,
      officeCheckOut: checkOut || undefined,
      updatedAt: new Date().toISOString()
    };

    setDraftDailyUpdates((prev) => {
      const next = targetId ? prev.map((item) => (item.id === targetId ? entry : item)) : [entry, ...prev];
      return sortDailyUpdatesByDateAsc(next);
    });
    return true;
  };

  const addDailyUpdate = () => {
    const saved = upsertDailyUpdate(dayUpdateForm);
    if (!saved) return;
    setDayUpdateForm((prev) => ({ ...initialDayUpdateForm(), workArea: prev.workArea }));
  };

  const removeDailyUpdate = (updateId: string) => {
    if (editingDayUpdateId === updateId) {
      setEditingDayUpdateId(null);
      setEditingDayUpdateForm(initialDayUpdateForm());
      setIsDayEditModalOpen(false);
    }
    setDraftDailyUpdates((prev) => prev.filter((item) => item.id !== updateId));
  };

  const startEditDailyUpdate = (update: WeeklyPlanDailyUpdate) => {
    setEditingDayUpdateId(update.id);
    setEditingDayUpdateForm({
      date: update.date,
      developerName: update.developerName,
      projectName: update.projectName ?? "",
      morningPlan: update.morningPlan ?? "",
      eveningUpdate: update.eveningUpdate ?? update.note ?? "",
      hasBlocker: update.hasBlocker ?? false,
      blockerDetails: update.blockerDetails ?? "",
      hasPendingWork: update.hasPendingWork ?? false,
      pendingWorkDetails: update.pendingWorkDetails ?? "",
      workArea: update.workArea,
      spentHours: update.spentHours === undefined ? "" : String(update.spentHours),
      progressPercent: update.progressPercent === undefined ? "" : String(update.progressPercent),
      officeCheckIn: update.officeCheckIn ?? "",
      officeCheckOut: update.officeCheckOut ?? ""
    });
    setIsDayEditModalOpen(true);
  };

  const cancelEditDailyUpdate = () => {
    setEditingDayUpdateId(null);
    setEditingDayUpdateForm(initialDayUpdateForm());
    setIsDayEditModalOpen(false);
  };

  const saveEditedDailyUpdate = () => {
    if (!editingDayUpdateId) return;
    const saved = upsertDailyUpdate(editingDayUpdateForm, editingDayUpdateId);
    if (!saved) return;
    setEditingDayUpdateId(null);
    setEditingDayUpdateForm(initialDayUpdateForm());
    setIsDayEditModalOpen(false);
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
            <td>${escapeHtml(update.projectName ?? "-")}</td>
            <td>${escapeHtml(update.workArea)}</td>
            <td>${update.spentHours ?? "-"}</td>
            <td>${update.progressPercent ?? 0}%</td>
            <td>${escapeHtml(update.officeCheckIn ?? "-")}</td>
            <td>${escapeHtml(update.officeCheckOut ?? "-")}</td>
            <td>${escapeHtml(getAttendanceStatus(update.officeCheckIn, update.officeCheckOut))}</td>
            <td>
              <strong>Morning:</strong> ${escapeHtml(update.morningPlan ?? "-")}<br/>
              <strong>Evening:</strong> ${escapeHtml(update.eveningUpdate ?? update.note ?? "-")}<br/>
              <strong>Blocker:</strong> ${escapeHtml(update.hasBlocker ? (update.blockerDetails ?? "Yes") : "No")}<br/>
              <strong>Pending:</strong> ${escapeHtml(update.hasPendingWork ? (update.pendingWorkDetails ?? "Yes") : "No")}
            </td>
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
            .col-project { width: 11%; }
            .col-area { width: 7%; }
            .col-hours { width: 6%; }
            .col-progress { width: 7%; }
            .col-in { width: 8%; }
            .col-out { width: 8%; }
            .col-att { width: 10%; }
            .col-note { width: 30%; }
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
                  <col class="col-project" />
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
                    <th>Project</th>
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
    setDraftDayPage(1);
    setDayUpdateForm((prev) => ({ ...initialDayUpdateForm(), workArea: prev.workArea }));
    setEditingDayUpdateId(null);
    setEditingDayUpdateForm(initialDayUpdateForm());
    setIsDayEditModalOpen(false);
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
                Project Name
                <input
                  value={dayUpdateForm.projectName}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, projectName: e.target.value }))}
                  placeholder="Example: myrec.asia"
                />
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

            <div className="grid two">
              <label>
                Morning Scrum Assignment
                <textarea
                  rows={4}
                  value={dayUpdateForm.morningPlan}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, morningPlan: e.target.value }))}
                  placeholder="Morning plan / assigned tasks..."
                />
              </label>
              <label>
                Evening Work Update
                <textarea
                  rows={4}
                  value={dayUpdateForm.eveningUpdate}
                  onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, eveningUpdate: e.target.value }))}
                  placeholder="End-of-day progress before office close..."
                />
              </label>
            </div>

            <div className="grid two">
              <div className="weekly-plan-item">
                <div className="row between gap">
                  <strong>Any Blockers?</strong>
                  <div className="row gap">
                    <button
                      type="button"
                      className={dayUpdateForm.hasBlocker ? "secondary" : ""}
                      onClick={() => setDayUpdateForm((prev) => ({ ...prev, hasBlocker: false, blockerDetails: "" }))}
                    >
                      No Blocker
                    </button>
                    <button
                      type="button"
                      className={dayUpdateForm.hasBlocker ? "" : "secondary"}
                      onClick={() => setDayUpdateForm((prev) => ({ ...prev, hasBlocker: true }))}
                    >
                      Has Blocker
                    </button>
                  </div>
                </div>
                {dayUpdateForm.hasBlocker ? (
                  <label>
                    Blocker Details
                    <textarea
                      rows={3}
                      value={dayUpdateForm.blockerDetails}
                      onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, blockerDetails: e.target.value }))}
                      placeholder="Write blocker details..."
                    />
                  </label>
                ) : null}
              </div>

              <div className="weekly-plan-item">
                <div className="row between gap">
                  <strong>Any Pending Work?</strong>
                  <div className="row gap">
                    <button
                      type="button"
                      className={dayUpdateForm.hasPendingWork ? "secondary" : ""}
                      onClick={() => setDayUpdateForm((prev) => ({ ...prev, hasPendingWork: false, pendingWorkDetails: "" }))}
                    >
                      No Pending
                    </button>
                    <button
                      type="button"
                      className={dayUpdateForm.hasPendingWork ? "" : "secondary"}
                      onClick={() => setDayUpdateForm((prev) => ({ ...prev, hasPendingWork: true }))}
                    >
                      Has Pending
                    </button>
                  </div>
                </div>
                {dayUpdateForm.hasPendingWork ? (
                  <label>
                    Pending Work Details
                    <textarea
                      rows={3}
                      value={dayUpdateForm.pendingWorkDetails}
                      onChange={(e) => setDayUpdateForm((prev) => ({ ...prev, pendingWorkDetails: e.target.value }))}
                      placeholder="Write pending work details..."
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="row gap">
              <button type="button" onClick={addDailyUpdate}>
                Add Day Update
              </button>
            </div>

            {draftDailyUpdates.length > 0 ? (
              <div className="stack">
                <div className="row between gap">
                  <small className="muted">
                    Day Pages: {draftDayPage} / {draftDayTotalPages}
                  </small>
                  <div className="row gap">
                    <button
                      type="button"
                      className="secondary"
                      disabled={draftDayPage <= 1}
                      onClick={() => setDraftDayPage((prev) => Math.max(prev - 1, 1))}
                    >
                      Prev Days
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={draftDayPage >= draftDayTotalPages}
                      onClick={() => setDraftDayPage((prev) => Math.min(prev + 1, draftDayTotalPages))}
                    >
                      Next Days
                    </button>
                  </div>
                </div>

                {paginatedDraftDayGroups.map((group) => (
                  <div key={group.date} className="weekly-plan-item">
                    <strong>{formatShortDate(group.date)}</strong>
                    <div className="stack">
                      {groupDailyUpdatesByDeveloper(group.items).map((devGroup) => (
                        <div key={`${group.date}-${devGroup.developerName}`} className="weekly-plan-item">
                          <strong>{devGroup.developerName}</strong>
                          <ul className="change-points">
                            {devGroup.items.map((update) => (
                              <li key={update.id}>
                                <div className="row between gap">
                                  <div className="muted">
                                    {update.projectName ?? "-"} | {update.workArea} | {update.spentHours ?? "-"}h |{" "}
                                    {update.progressPercent ?? 0}%
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
                                <div><strong>Morning:</strong> {update.morningPlan ?? "-"}</div>
                                <div><strong>Evening:</strong> {update.eveningUpdate ?? update.note ?? "-"}</div>
                                <div><strong>Blocker:</strong> {update.hasBlocker ? (update.blockerDetails ?? "Yes") : "No"}</div>
                                <div><strong>Pending:</strong> {update.hasPendingWork ? (update.pendingWorkDetails ?? "Yes") : "No"}</div>
                              </li>
                            ))}
                          </ul>
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
                  {(() => {
                    const dayGroups = groupDailyUpdatesByDate(plan.dailyUpdates);
                    const dayTotalPages = Math.max(1, Math.ceil(dayGroups.length / DAY_GROUPS_PER_PAGE));
                    const currentPage = Math.min(Math.max(planDayPages[plan.id] ?? 1, 1), dayTotalPages);
                    const start = (currentPage - 1) * DAY_GROUPS_PER_PAGE;
                    const visibleDayGroups = dayGroups.slice(start, start + DAY_GROUPS_PER_PAGE);

                    return (
                      <>
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

                        {dayGroups.length > 0 ? (
                          <div className="row between gap">
                            <small className="muted">
                              Day Pages: {currentPage} / {dayTotalPages}
                            </small>
                            <div className="row gap">
                              <button
                                type="button"
                                className="secondary"
                                disabled={currentPage <= 1}
                                onClick={() =>
                                  setPlanDayPages((prev) => ({
                                    ...prev,
                                    [plan.id]: Math.max((prev[plan.id] ?? 1) - 1, 1)
                                  }))
                                }
                              >
                                Prev Days
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={currentPage >= dayTotalPages}
                                onClick={() =>
                                  setPlanDayPages((prev) => ({
                                    ...prev,
                                    [plan.id]: Math.min((prev[plan.id] ?? 1) + 1, dayTotalPages)
                                  }))
                                }
                              >
                                Next Days
                              </button>
                            </div>
                          </div>
                        ) : null}

                        <div className="stack">
                          {plan.dailyUpdates.length > 0 ? (
                            visibleDayGroups.map((group) => (
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
                                  {groupDailyUpdatesByDeveloper(group.items).map((devGroup) => (
                                    <div key={`${plan.id}-${group.date}-${devGroup.developerName}`} className="compact-cell">
                                      <strong>{devGroup.developerName}</strong>
                                      <ul className="change-points">
                                        {devGroup.items.map((update) => (
                                          <li key={update.id}>
                                            <div>
                                              {update.projectName ?? "-"} | {update.workArea} | {update.spentHours ?? "-"}h |{" "}
                                              {update.progressPercent ?? 0}%
                                            </div>
                                            <div className="muted">
                                              Office: {update.officeCheckIn ?? "-"} - {update.officeCheckOut ?? "-"} |{" "}
                                              {getAttendanceStatus(update.officeCheckIn, update.officeCheckOut)}
                                            </div>
                                            <div><strong>Morning:</strong> {update.morningPlan ?? "-"}</div>
                                            <div><strong>Evening:</strong> {update.eveningUpdate ?? update.note ?? "-"}</div>
                                            <div><strong>Blocker:</strong> {update.hasBlocker ? (update.blockerDetails ?? "Yes") : "No"}</div>
                                            <div><strong>Pending:</strong> {update.hasPendingWork ? (update.pendingWorkDetails ?? "Yes") : "No"}</div>
                                          </li>
                                        ))}
                                      </ul>
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
                      </>
                    );
                  })()}
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
                            {formatShortDate(update.date)} | {update.projectName ?? "-"} | {update.workArea} | {update.spentHours ?? "-"}h | {update.progressPercent ?? 0}%
                          </div>
                          <div><strong>Morning:</strong> {update.morningPlan ?? "-"}</div>
                          <div><strong>Evening:</strong> {update.eveningUpdate ?? update.note ?? "-"}</div>
                          <div><strong>Blocker:</strong> {update.hasBlocker ? (update.blockerDetails ?? "Yes") : "No"}</div>
                          <div><strong>Pending:</strong> {update.hasPendingWork ? (update.pendingWorkDetails ?? "Yes") : "No"}</div>
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

      {isDayEditModalOpen && editingDayUpdateId ? (
        <div className="modal-backdrop" onClick={cancelEditDailyUpdate}>
          <section className="modal-card modal-card-lg stack" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="row between gap">
              <h3>Edit Day-wise Update</h3>
              <button type="button" className="secondary" onClick={cancelEditDailyUpdate}>
                Close
              </button>
            </div>

            <div className="grid five">
              <label>
                Date
                <input
                  type="date"
                  value={editingDayUpdateForm.date}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, date: e.target.value }))}
                />
              </label>
              <label>
                Developer Name
                <input
                  list="weekly-dev-names"
                  value={editingDayUpdateForm.developerName}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, developerName: e.target.value }))}
                  placeholder="Raihan / Mainul / Noman"
                />
              </label>
              <label>
                Project Name
                <input
                  value={editingDayUpdateForm.projectName}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, projectName: e.target.value }))}
                  placeholder="Example: myrec.asia"
                />
              </label>
              <label>
                Work Area
                <select
                  value={editingDayUpdateForm.workArea}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, workArea: e.target.value as WeeklyDayWorkArea }))}
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
                  value={editingDayUpdateForm.spentHours}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, spentHours: e.target.value }))}
                />
              </label>
              <label>
                Completion (%)
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editingDayUpdateForm.progressPercent}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, progressPercent: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid two">
              <label>
                Office Check-in
                <input
                  type="time"
                  value={editingDayUpdateForm.officeCheckIn}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, officeCheckIn: e.target.value }))}
                />
              </label>
              <label>
                Office Check-out
                <input
                  type="time"
                  value={editingDayUpdateForm.officeCheckOut}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, officeCheckOut: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid two">
              <label>
                Morning Scrum Assignment
                <textarea
                  rows={5}
                  value={editingDayUpdateForm.morningPlan}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, morningPlan: e.target.value }))}
                />
              </label>
              <label>
                Evening Work Update
                <textarea
                  rows={5}
                  value={editingDayUpdateForm.eveningUpdate}
                  onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, eveningUpdate: e.target.value }))}
                />
              </label>
            </div>

            <div className="grid two">
              <div className="weekly-plan-item">
                <div className="row between gap">
                  <strong>Any Blockers?</strong>
                  <div className="row gap">
                    <button
                      type="button"
                      className={editingDayUpdateForm.hasBlocker ? "secondary" : ""}
                      onClick={() => setEditingDayUpdateForm((prev) => ({ ...prev, hasBlocker: false, blockerDetails: "" }))}
                    >
                      No Blocker
                    </button>
                    <button
                      type="button"
                      className={editingDayUpdateForm.hasBlocker ? "" : "secondary"}
                      onClick={() => setEditingDayUpdateForm((prev) => ({ ...prev, hasBlocker: true }))}
                    >
                      Has Blocker
                    </button>
                  </div>
                </div>
                {editingDayUpdateForm.hasBlocker ? (
                  <label>
                    Blocker Details
                    <textarea
                      rows={4}
                      value={editingDayUpdateForm.blockerDetails}
                      onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, blockerDetails: e.target.value }))}
                    />
                  </label>
                ) : null}
              </div>

              <div className="weekly-plan-item">
                <div className="row between gap">
                  <strong>Any Pending Work?</strong>
                  <div className="row gap">
                    <button
                      type="button"
                      className={editingDayUpdateForm.hasPendingWork ? "secondary" : ""}
                      onClick={() => setEditingDayUpdateForm((prev) => ({ ...prev, hasPendingWork: false, pendingWorkDetails: "" }))}
                    >
                      No Pending
                    </button>
                    <button
                      type="button"
                      className={editingDayUpdateForm.hasPendingWork ? "" : "secondary"}
                      onClick={() => setEditingDayUpdateForm((prev) => ({ ...prev, hasPendingWork: true }))}
                    >
                      Has Pending
                    </button>
                  </div>
                </div>
                {editingDayUpdateForm.hasPendingWork ? (
                  <label>
                    Pending Work Details
                    <textarea
                      rows={4}
                      value={editingDayUpdateForm.pendingWorkDetails}
                      onChange={(e) => setEditingDayUpdateForm((prev) => ({ ...prev, pendingWorkDetails: e.target.value }))}
                    />
                  </label>
                ) : null}
              </div>
            </div>

            <div className="row gap">
              <button type="button" onClick={saveEditedDailyUpdate}>
                Update Day Update
              </button>
              <button type="button" className="secondary" onClick={cancelEditDailyUpdate}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
