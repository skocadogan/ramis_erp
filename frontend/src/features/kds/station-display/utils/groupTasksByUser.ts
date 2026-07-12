import { PrepTask } from "@/features/prep/types";
import { type UserTaskGroup, type GroupedTasks } from "../types";

/**
 * Split tasks into active groups by assigned user + completed/cancelled list.
 *
 * Rules:
 * 1. Active = PENDING, IN_PROGRESS; Done = COMPLETED, CANCELLED
 * 2. Group active tasks by assigned_to / assigned_to_name
 * 3. null assigned_to_name → "Herkes" group (genele atanmış görev), userId=null
 * 4. Within each group: IN_PROGRESS first, then PENDING, then by priority desc
 * 5. Sort groups: by name alphabetically, "Herkes" always last
 * 6. Completed tasks sorted by updated_at desc
 * 7. Stats: count per status, user count
 */
export function groupTasksByUser(allTasks: PrepTask[]): GroupedTasks {
  const active = allTasks.filter(
    (t) => t.status === "PENDING" || t.status === "IN_PROGRESS"
  );
  const done = allTasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "CANCELLED"
  );

  // Group active tasks by assignee
  const groupMap = new Map<string, UserTaskGroup>();

  for (const task of active) {
    const name = task.assigned_to_name;
    const isUnassigned = !name;
    const key = isUnassigned ? "__unassigned__" : name;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        // display_name ile atanmış (assigned_to=null, assigned_to_name=dolu) → userId synthetic
        userId: isUnassigned
          ? null
          : (task.assigned_to ?? `__display__${name}`),
        userName: isUnassigned ? "Herkes" : name,
        tasks: [],
      });
    }
    groupMap.get(key)!.tasks.push(task);
  }

  // Sort within each group: IN_PROGRESS first, then PENDING, then priority desc
  for (const group of groupMap.values()) {
    group.tasks.sort((a, b) => {
      const statusOrder: Record<string, number> = { IN_PROGRESS: 0, PENDING: 1 };
      const oa = statusOrder[a.status] ?? 2;
      const ob = statusOrder[b.status] ?? 2;
      if (oa !== ob) return oa - ob;
      return b.priority - a.priority;
    });
  }

  // Convert to array and sort groups
  const activeGroups: UserTaskGroup[] = Array.from(groupMap.values()).sort(
    (a, b) => {
      // "Herkes" (genele atanmış) always last
      if (a.userId === null && b.userId === null) return 0;
      if (a.userId === null) return 1;
      if (b.userId === null) return -1;
      return a.userName.localeCompare(b.userName, "tr");
    }
  );

  // Sort completed tasks by updated_at desc (most recent first)
  const completedTasks = [...done].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  // Compute stats
  const stats = {
    totalActive: active.length,
    totalInProgress: allTasks.filter((t) => t.status === "IN_PROGRESS").length,
    totalPending: allTasks.filter((t) => t.status === "PENDING").length,
    totalCompleted: allTasks.filter((t) => t.status === "COMPLETED").length,
    totalCancelled: allTasks.filter((t) => t.status === "CANCELLED").length,
    userCount: activeGroups.filter((g) => g.userId !== null).length,
  };

  return { activeGroups, completedTasks, stats };
}
