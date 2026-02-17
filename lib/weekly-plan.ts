import { supabase } from "@/lib/supabase";
import type { WeeklyDayWorkArea, WeeklyPlan, WeeklyPlanDailyUpdate, WeeklyPlanInput } from "@/lib/types";

const STORAGE_KEY = "project-tracker-weekly-plans-v3";
const SUPABASE_WEEKLY_PLANS_TABLE = "weekly_plans";
const SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE = "weekly_plan_daily_entries";

type DbWeeklyPlanRow = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  daily_updates: unknown;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type DbWeeklyPlanEntryRow = {
  id: number;
  weekly_plan_id: string;
  source_update_id: string;
  entry_date: string;
  developer_name: string;
  project_name: string | null;
  work_area: string;
  morning_plan: string | null;
  evening_update: string | null;
  spent_hours: number | null;
  progress_percent: number | null;
  office_check_in: string | null;
  office_check_out: string | null;
  has_blocker: boolean;
  blocker_details: string | null;
  has_pending_work: boolean;
  pending_work_details: string | null;
  updated_at: string;
};

const VALID_WORK_AREAS: WeeklyDayWorkArea[] = ["Frontend", "Backend", "QA", "Frontend + Backend", "Other"];

type CreateWeeklyPlanPayload = WeeklyPlanInput & {
  id: string;
  createdByUserId: string;
};

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeWorkArea(value: unknown): WeeklyDayWorkArea {
  if (typeof value === "string" && VALID_WORK_AREAS.includes(value as WeeklyDayWorkArea)) {
    return value as WeeklyDayWorkArea;
  }
  return "Other";
}

function normalizeDailyUpdates(value: unknown): WeeklyPlanDailyUpdate[] {
  if (!Array.isArray(value)) return [];
  const isValidTime = (time: unknown) => typeof time === "string" && /^\d{2}:\d{2}$/.test(time);
  const toBool = (v: unknown) => v === true || v === "true";

  const mapped = value
    .map((entry): WeeklyPlanDailyUpdate | null => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const id = safeString(record.id);
      const date = safeString(record.date);
      const developerName = safeString(record.developerName, "").trim();
      const projectName = safeString(record.projectName).trim();
      const legacyNote = safeString(record.note).trim();
      const morningPlan = safeString(record.morningPlan).trim();
      const eveningUpdate = safeString(record.eveningUpdate).trim() || legacyNote;
      if (!id || !date || !developerName) return null;
      if (!morningPlan && !eveningUpdate && !legacyNote) return null;

      const spentHoursRaw = Number(record.spentHours);
      const spentHours = Number.isFinite(spentHoursRaw) && spentHoursRaw >= 0 ? spentHoursRaw : undefined;
      const progressRaw = Number(record.progressPercent);
      const progressPercent = Number.isFinite(progressRaw) ? Math.min(Math.max(progressRaw, 0), 100) : undefined;
      const officeCheckIn = isValidTime(record.officeCheckIn) ? (record.officeCheckIn as string) : undefined;
      const officeCheckOut = isValidTime(record.officeCheckOut) ? (record.officeCheckOut as string) : undefined;
      const hasBlocker = toBool(record.hasBlocker);
      const blockerDetails = safeString(record.blockerDetails).trim();
      const hasPendingWork = toBool(record.hasPendingWork);
      const pendingWorkDetails = safeString(record.pendingWorkDetails).trim();

      return {
        id,
        date,
        developerName,
        projectName: projectName || undefined,
        note: eveningUpdate || legacyNote || undefined,
        morningPlan: morningPlan || undefined,
        eveningUpdate: eveningUpdate || undefined,
        hasBlocker,
        blockerDetails: blockerDetails || undefined,
        hasPendingWork,
        pendingWorkDetails: pendingWorkDetails || undefined,
        workArea: normalizeWorkArea(record.workArea),
        spentHours,
        progressPercent,
        officeCheckIn,
        officeCheckOut,
        updatedAt: safeString(record.updatedAt, new Date().toISOString())
      };
    })
    .filter((entry): entry is WeeklyPlanDailyUpdate => entry !== null);

  return mapped.sort((a, b) => b.date.localeCompare(a.date));
}

function rowToWeeklyPlan(row: DbWeeklyPlanRow, dailyUpdates: WeeklyPlanDailyUpdate[]): WeeklyPlan {
  return {
    id: row.id,
    weekStartDate: row.week_start_date,
    weekEndDate: row.week_end_date,
    dailyUpdates,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function weeklyPlanToRow(plan: WeeklyPlan): DbWeeklyPlanRow {
  return {
    id: plan.id,
    week_start_date: plan.weekStartDate,
    week_end_date: plan.weekEndDate,
    daily_updates: plan.dailyUpdates,
    created_by_user_id: plan.createdByUserId,
    created_at: plan.createdAt,
    updated_at: plan.updatedAt
  };
}

function updateToEntryRow(planId: string, update: WeeklyPlanDailyUpdate) {
  return {
    weekly_plan_id: planId,
    source_update_id: update.id,
    entry_date: update.date,
    developer_name: update.developerName,
    project_name: update.projectName ?? null,
    work_area: update.workArea,
    morning_plan: update.morningPlan ?? null,
    evening_update: update.eveningUpdate ?? update.note ?? null,
    spent_hours: update.spentHours ?? null,
    progress_percent: update.progressPercent ?? null,
    office_check_in: update.officeCheckIn ?? null,
    office_check_out: update.officeCheckOut ?? null,
    has_blocker: Boolean(update.hasBlocker),
    blocker_details: update.blockerDetails ?? null,
    has_pending_work: Boolean(update.hasPendingWork),
    pending_work_details: update.pendingWorkDetails ?? null,
    updated_at: update.updatedAt
  };
}

function entryRowToUpdate(row: DbWeeklyPlanEntryRow): WeeklyPlanDailyUpdate {
  return {
    id: row.source_update_id || `${row.weekly_plan_id}-entry-${row.id}`,
    date: row.entry_date,
    developerName: row.developer_name,
    projectName: row.project_name ?? undefined,
    note: row.evening_update ?? undefined,
    morningPlan: row.morning_plan ?? undefined,
    eveningUpdate: row.evening_update ?? undefined,
    hasBlocker: Boolean(row.has_blocker),
    blockerDetails: row.blocker_details ?? undefined,
    hasPendingWork: Boolean(row.has_pending_work),
    pendingWorkDetails: row.pending_work_details ?? undefined,
    workArea: normalizeWorkArea(row.work_area),
    spentHours: row.spent_hours ?? undefined,
    progressPercent: row.progress_percent ?? undefined,
    officeCheckIn: row.office_check_in ?? undefined,
    officeCheckOut: row.office_check_out ?? undefined,
    updatedAt: row.updated_at
  };
}

function isMissingEntryTableError(message: string) {
  const text = message.toLowerCase();
  return text.includes(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE) && (text.includes("does not exist") || text.includes("schema cache"));
}

class WeeklyPlanRepository {
  async read(): Promise<WeeklyPlan[]> {
    const local = this.readFromLocal();
    if (!supabase) return local;

    const { data: planData, error: planError } = await supabase
      .from(SUPABASE_WEEKLY_PLANS_TABLE)
      .select("id, week_start_date, week_end_date, daily_updates, created_by_user_id, created_at, updated_at")
      .order("week_start_date", { ascending: false });

    if (planError) {
      console.warn("Supabase weekly plan read failed, using local data:", planError.message);
      return local;
    }

    const planRows = (planData ?? []) as DbWeeklyPlanRow[];
    if (planRows.length === 0) {
      if (local.length > 0) return local;
      this.writeToLocal([]);
      return [];
    }

    let entryRows: DbWeeklyPlanEntryRow[] = [];
    const planIds = planRows.map((row) => row.id);

    const { data: entryData, error: entryError } = await supabase
      .from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE)
      .select(
        "id, weekly_plan_id, source_update_id, entry_date, developer_name, project_name, work_area, morning_plan, evening_update, spent_hours, progress_percent, office_check_in, office_check_out, has_blocker, blocker_details, has_pending_work, pending_work_details, updated_at"
      )
      .in("weekly_plan_id", planIds)
      .order("entry_date", { ascending: false });

    if (entryError) {
      console.warn("Supabase weekly plan entry read failed, using legacy daily_updates:", entryError.message);
    } else {
      entryRows = (entryData ?? []) as DbWeeklyPlanEntryRow[];
    }

    const entriesByPlan = new Map<string, WeeklyPlanDailyUpdate[]>();
    for (const row of entryRows) {
      const list = entriesByPlan.get(row.weekly_plan_id) ?? [];
      list.push(entryRowToUpdate(row));
      entriesByPlan.set(row.weekly_plan_id, list);
    }

    const remotePlans = planRows.map((row) => {
      const normalized = entriesByPlan.get(row.id);
      const dailyUpdates = normalized && normalized.length > 0 ? normalizeDailyUpdates(normalized) : normalizeDailyUpdates(row.daily_updates);
      return rowToWeeklyPlan(row, dailyUpdates);
    });

    const remoteIds = new Set(remotePlans.map((plan) => plan.id));
    const unsyncedLocal = local.filter((plan) => !remoteIds.has(plan.id));
    const merged =
      unsyncedLocal.length > 0
        ? [...remotePlans, ...unsyncedLocal].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate))
        : remotePlans;

    this.writeToLocal(merged);
    return merged;
  }

  async create(payload: CreateWeeklyPlanPayload): Promise<WeeklyPlan> {
    const nowIso = new Date().toISOString();
    const plan: WeeklyPlan = {
      id: payload.id,
      weekStartDate: payload.weekStartDate,
      weekEndDate: payload.weekEndDate,
      dailyUpdates: normalizeDailyUpdates(payload.dailyUpdates ?? []),
      createdByUserId: payload.createdByUserId,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (supabase) {
      const { error: planInsertError } = await supabase.from(SUPABASE_WEEKLY_PLANS_TABLE).insert(weeklyPlanToRow(plan));
      if (planInsertError) {
        throw new Error(`Weekly plan create failed: ${planInsertError.message}`);
      }

      if (plan.dailyUpdates.length > 0) {
        const entryRows = plan.dailyUpdates.map((update) => updateToEntryRow(plan.id, update));
        const { error: entryInsertError } = await supabase.from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE).insert(entryRows);
        if (entryInsertError) {
          if (isMissingEntryTableError(entryInsertError.message)) {
            console.warn("Supabase weekly plan entry table unavailable, keeping legacy daily_updates only:", entryInsertError.message);
          } else {
            await supabase.from(SUPABASE_WEEKLY_PLANS_TABLE).delete().eq("id", plan.id);
            throw new Error(`Weekly plan entry create failed: ${entryInsertError.message}`);
          }
        }
      }
    }

    const local = this.readFromLocal();
    this.writeToLocal([plan, ...local]);
    return plan;
  }

  async update(planId: string, input: WeeklyPlanInput): Promise<WeeklyPlan | null> {
    let local = this.readFromLocal();
    let current = local.find((item) => item.id === planId);
    if (!current && supabase) {
      const remote = await this.read();
      current = remote.find((item) => item.id === planId);
      local = this.readFromLocal();
    }
    if (!current) return null;

    const next: WeeklyPlan = {
      ...current,
      weekStartDate: input.weekStartDate,
      weekEndDate: input.weekEndDate,
      dailyUpdates: normalizeDailyUpdates(input.dailyUpdates ?? current.dailyUpdates),
      updatedAt: new Date().toISOString()
    };

    if (supabase) {
      const { error: planUpdateError } = await supabase
        .from(SUPABASE_WEEKLY_PLANS_TABLE)
        .update(weeklyPlanToRow(next))
        .eq("id", planId);

      if (planUpdateError) {
        throw new Error(`Weekly plan update failed: ${planUpdateError.message}`);
      }

      const { data: existingEntryData, error: existingEntryError } = await supabase
        .from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE)
        .select("source_update_id")
        .eq("weekly_plan_id", planId);

      if (existingEntryError) {
        if (isMissingEntryTableError(existingEntryError.message)) {
          this.writeToLocal(local.map((item) => (item.id === planId ? next : item)));
          return next;
        }
        throw new Error(`Weekly plan entry lookup failed: ${existingEntryError.message}`);
      }

      const existingEntryIds = (existingEntryData ?? [])
        .map((row) => (row as { source_update_id?: string }).source_update_id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

      if (next.dailyUpdates.length === 0) {
        const { error: entryDeleteAllError } = await supabase
          .from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE)
          .delete()
          .eq("weekly_plan_id", planId);
        if (entryDeleteAllError) {
          throw new Error(`Weekly plan entry cleanup failed: ${entryDeleteAllError.message}`);
        }
      } else {
        const entryRows = next.dailyUpdates.map((update) => updateToEntryRow(planId, update));
        const { error: entryUpsertError } = await supabase
          .from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE)
          .upsert(entryRows, { onConflict: "weekly_plan_id,source_update_id" });

        if (entryUpsertError) {
          throw new Error(`Weekly plan entry update failed: ${entryUpsertError.message}`);
        }

        const nextEntryIds = new Set(entryRows.map((row) => row.source_update_id));
        const removedEntryIds = existingEntryIds.filter((id) => !nextEntryIds.has(id));
        if (removedEntryIds.length > 0) {
          const { error: entryDeleteRemovedError } = await supabase
            .from(SUPABASE_WEEKLY_PLAN_ENTRIES_TABLE)
            .delete()
            .eq("weekly_plan_id", planId)
            .in("source_update_id", removedEntryIds);
          if (entryDeleteRemovedError) {
            throw new Error(`Weekly plan entry delete failed: ${entryDeleteRemovedError.message}`);
          }
        }
      }
    }

    this.writeToLocal(local.map((item) => (item.id === planId ? next : item)));
    return next;
  }

  async remove(planId: string): Promise<void> {
    if (supabase) {
      const { error } = await supabase.from(SUPABASE_WEEKLY_PLANS_TABLE).delete().eq("id", planId);
      if (error) {
        throw new Error(`Weekly plan delete failed: ${error.message}`);
      }
    }

    const local = this.readFromLocal();
    this.writeToLocal(local.filter((item) => item.id !== planId));
  }

  private readFromLocal(): WeeklyPlan[] {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const mapped = parsed
        .map((item): WeeklyPlan | null => {
          if (typeof item !== "object" || item === null) return null;
          const record = item as Record<string, unknown>;
          const id = safeString(record.id);
          const weekStartDate = safeString(record.weekStartDate);
          const weekEndDate = safeString(record.weekEndDate);
          if (!id || !weekStartDate || !weekEndDate) return null;

          return {
            id,
            weekStartDate,
            weekEndDate,
            dailyUpdates: normalizeDailyUpdates(record.dailyUpdates),
            createdByUserId: safeString(record.createdByUserId),
            createdAt: safeString(record.createdAt, new Date().toISOString()),
            updatedAt: safeString(record.updatedAt, new Date().toISOString())
          };
        })
        .filter((item): item is WeeklyPlan => item !== null);

      return mapped.sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
    } catch {
      return [];
    }
  }

  private writeToLocal(plans: WeeklyPlan[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  }
}

export const weeklyPlanRepository = new WeeklyPlanRepository();
