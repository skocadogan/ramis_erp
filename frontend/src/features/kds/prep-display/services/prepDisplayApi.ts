import axios from "axios";
import { getRuntimeConfig } from "@/lib/runtimeConfig";
import type { PrepTask } from "@/features/prep/types";

export interface PrepDisplayBranch {
  id: string;
  name: string;
}

export interface PrepDisplayStation {
  id: string;
  name: string;
  color: string;
  branch: string;
  branch_name: string;
}

export interface PrepDisplaySession {
  display_token: string;
  max_age: number;
  branch_id: string;
  station_id: string;
  station: PrepDisplayStation;
}

const setupClient = axios.create({
  headers: { "Content-Type": "application/json" },
});

setupClient.interceptors.request.use((config) => {
  config.baseURL = getRuntimeConfig().apiBaseUrl;
  return config;
});

function displayClient(displayToken: string) {
  const client = axios.create({
    headers: {
      "Content-Type": "application/json",
      "X-Prep-Display-Token": displayToken,
    },
  });
  client.interceptors.request.use((config) => {
    config.baseURL = getRuntimeConfig().apiBaseUrl;
    return config;
  });
  return client;
}

export const prepDisplayApi = {
  getBranches: async (): Promise<PrepDisplayBranch[]> => {
    const res = await setupClient.get<PrepDisplayBranch[]>("/prep-display/setup/branches/");
    return res.data;
  },

  getStations: async (branchId: string): Promise<PrepDisplayStation[]> => {
    const res = await setupClient.get<PrepDisplayStation[]>("/prep-display/setup/stations/", {
      params: { branch_id: branchId },
    });
    return res.data;
  },

  createSession: async (branchId: string, stationId: string): Promise<PrepDisplaySession> => {
    const res = await setupClient.post<PrepDisplaySession>("/prep-display/session/", {
      branch_id: branchId,
      station_id: stationId,
    });
    return res.data;
  },

  verifySession: async (displayToken: string): Promise<PrepDisplaySession | null> => {
    try {
      const res = await setupClient.post<{
        valid: boolean;
        display_token: string;
        branch_id: string;
        station_id: string;
        station: PrepDisplayStation;
      }>("/prep-display/verify/", { display_token: displayToken });
      if (!res.data.valid) return null;
      return {
        display_token: res.data.display_token,
        max_age: 0,
        branch_id: res.data.branch_id,
        station_id: res.data.station_id,
        station: res.data.station,
      };
    } catch {
      return null;
    }
  },

  getStation: async (displayToken: string): Promise<PrepDisplayStation> => {
    const res = await displayClient(displayToken).get<PrepDisplayStation>("/prep-display/station/");
    return res.data;
  },

  getTasks: async (displayToken: string, stationId: string): Promise<PrepTask[]> => {
    const res = await displayClient(displayToken).get<PrepTask[]>("/prep-display/tasks/", {
      params: { station_id: stationId },
    });
    return res.data;
  },
};
