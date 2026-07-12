import { PrepTask } from "@/features/prep/types";

export interface UserTaskGroup {
  userId: string | null;
  userName: string;
  tasks: PrepTask[];
}

export interface GroupedTasks {
  activeGroups: UserTaskGroup[];
  completedTasks: PrepTask[];
  stats: {
    totalActive: number;
    totalInProgress: number;
    totalPending: number;
    totalCompleted: number;
    totalCancelled: number;
    userCount: number;
  };
}
