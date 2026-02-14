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
};

const CORE_DEVELOPERS = ["Raihan", "Mainul", "Noman"] as const;

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
    progressPercent: ""
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

    const entry: WeeklyPlanDailyUpdate = {
      id: editingDayUpdateId || createId(),
      date: dayUpdateForm.date,
      developerName,
      note,
      workArea: dayUpdateForm.workArea,
      spentHours: spentHoursRaw ? spentHoursValue : undefined,
      progressPercent: progressRaw ? progressValue : undefined,
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
      progressPercent: update.progressPercent === undefined ? "" : String(update.progressPercent)
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
                          <strong>{formatShortDate(group.date)}</strong>
                          <div className="stack">
                            {group.items.map((update) => (
                              <div key={update.id} className="compact-cell">
                                <div>
                                  {update.developerName} | {update.workArea} | {update.spentHours ?? "-"}h | {update.progressPercent ?? 0}%
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
