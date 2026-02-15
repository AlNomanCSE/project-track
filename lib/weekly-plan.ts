import { supabase } from "@/lib/supabase";
import type { WeeklyDayWorkArea, WeeklyPlan, WeeklyPlanDailyUpdate, WeeklyPlanInput } from "@/lib/types";

const STORAGE_KEY = "project-tracker-weekly-plans-v3";
const SUPABASE_WEEKLY_PLANS_TABLE = "weekly_plans";

type DbWeeklyPlanRow = {
  id: string;
  week_start_date: string;
  week_end_date: string;
  daily_updates: unknown;
  created_by_user_id: string;
  created_at: string;
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
  const mapped = value
    .map((entry): WeeklyPlanDailyUpdate | null => {
      if (typeof entry !== "object" || entry === null) return null;
      const record = entry as Record<string, unknown>;
      const id = safeString(record.id);
      const date = safeString(record.date);
      const developerName = safeString(record.developerName, "").trim();
      const note = safeString(record.note).trim();
      if (!id || !date || !note || !developerName) return null;

      const spentHoursRaw = Number(record.spentHours);
      const spentHours = Number.isFinite(spentHoursRaw) && spentHoursRaw >= 0 ? spentHoursRaw : undefined;
      const progressRaw = Number(record.progressPercent);
      const progressPercent = Number.isFinite(progressRaw)
        ? Math.min(Math.max(progressRaw, 0), 100)
        : undefined;
      const officeCheckIn = isValidTime(record.officeCheckIn) ? (record.officeCheckIn as string) : undefined;
      const officeCheckOut = isValidTime(record.officeCheckOut) ? (record.officeCheckOut as string) : undefined;

      return {
        id,
        date,
        developerName,
        note,
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

function rowToWeeklyPlan(row: DbWeeklyPlanRow): WeeklyPlan {
  return {
    id: row.id,
    weekStartDate: row.week_start_date,
    weekEndDate: row.week_end_date,
    dailyUpdates: normalizeDailyUpdates(row.daily_updates),
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

class WeeklyPlanRepository {
  async read(): Promise<WeeklyPlan[]> {
    const local = this.readFromLocal();
    if (!supabase) return local;

    const { data, error } = await supabase
      .from(SUPABASE_WEEKLY_PLANS_TABLE)
      .select("id, week_start_date, week_end_date, daily_updates, created_by_user_id, created_at, updated_at")
      .order("week_start_date", { ascending: false });

    if (error) {
      console.warn("Supabase weekly plan read failed, using local data:", error.message);
      return local;
    }

    const remotePlans = ((data ?? []) as DbWeeklyPlanRow[]).map(rowToWeeklyPlan);

    if (remotePlans.length === 0) {
      // Avoid wiping unsynced local plans when remote returns empty.
      if (local.length > 0) return local;
      this.writeToLocal([]);
      return [];
    }

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
      const { error } = await supabase.from(SUPABASE_WEEKLY_PLANS_TABLE).insert(weeklyPlanToRow(plan));
      if (error) {
        throw new Error(`Weekly plan create failed: ${error.message}`);
      }
    }

    const local = this.readFromLocal();
    this.writeToLocal([plan, ...local]);
    return plan;
  }

  async update(planId: string, input: WeeklyPlanInput): Promise<WeeklyPlan | null> {
    const local = this.readFromLocal();
    const current = local.find((item) => item.id === planId);
    if (!current) return null;

    const next: WeeklyPlan = {
      ...current,
      weekStartDate: input.weekStartDate,
      weekEndDate: input.weekEndDate,
      dailyUpdates: normalizeDailyUpdates(input.dailyUpdates ?? current.dailyUpdates),
      updatedAt: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase
        .from(SUPABASE_WEEKLY_PLANS_TABLE)
        .update(weeklyPlanToRow(next))
        .eq("id", planId);
      if (error) {
        throw new Error(`Weekly plan update failed: ${error.message}`);
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
