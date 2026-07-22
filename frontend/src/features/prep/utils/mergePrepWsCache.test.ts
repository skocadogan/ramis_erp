import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrepTask } from "../types";
import { applyPrepKitchenWsPayload } from "./mergePrepWsCache";

function makeTask(overrides: Partial<PrepTask> = {}): PrepTask {
  return {
    id: "task-1",
    branch: "branch-1",
    station: "station-1",
    station_name: "Station 1",
    title: "Test task",
    description: null,
    target_quantity: 1,
    completed_quantity: 0,
    unit: "adet",
    status: "PENDING",
    priority: 0,
    deadline: null,
    assigned_to: null,
    assigned_to_name: null,
    completed_by: null,
    completed_by_name: null,
    is_recurring: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("applyPrepKitchenWsPayload", () => {
  let queryClient: QueryClient;

  afterEach(() => {
    queryClient?.clear();
  });

  it("incremental task güncellemesinde flat cache merge eder ve infinite/count invalidate eder", () => {
    queryClient = new QueryClient();
    const existing = makeTask({ status: "PENDING" });
    const updated = makeTask({ status: "IN_PROGRESS", completed_quantity: 1 });

    queryClient.setQueryData(["prep-tasks", "branch-1", "station-1", "operational"], [existing]);
    queryClient.setQueryData(
      ["prep-tasks-infinite", "branch-1", undefined, "all", "branch_default"],
      { pages: [{ results: [existing], count: 1, next: null }], pageParams: [1] },
    );
    queryClient.setQueryData(["prep-task-count", "active", "branch-1", "branch_default"], {
      count: 1,
      results: [],
      next: null,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    applyPrepKitchenWsPayload(queryClient, { task: updated });

    const flat = queryClient.getQueryData<PrepTask[]>([
      "prep-tasks",
      "branch-1",
      "station-1",
      "operational",
    ]);
    expect(flat?.[0]?.status).toBe("IN_PROGRESS");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-tasks-infinite"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-task-count"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["prep-tasks"] });
  });

  it("removed_task_id sonrası infinite/count invalidate eder", () => {
    queryClient = new QueryClient();
    const existing = makeTask();
    queryClient.setQueryData(["prep-tasks", "branch-1", undefined, "operational"], [existing]);

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    applyPrepKitchenWsPayload(queryClient, { removed_task_id: "task-1" });

    const flat = queryClient.getQueryData<PrepTask[]>([
      "prep-tasks",
      "branch-1",
      undefined,
      "operational",
    ]);
    expect(flat).toEqual([]);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-tasks-infinite"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-task-count"] });
  });

  it("refresh_all tüm prep query ailelerini invalidate eder", () => {
    queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    applyPrepKitchenWsPayload(queryClient, { refresh_all: true });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-tasks"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-tasks-infinite"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["prep-task-count"] });
  });
});
