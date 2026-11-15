"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminMaintenanceSchema,
  maintenanceHistorySchema,
  type CloseMaintenanceInput,
  type ScheduleMaintenanceInput,
  type StartMaintenanceInput,
} from "@/schemas";
import { SITE_STATUS_KEY } from "@/features/maintenance/status";
import { adminRequest } from "../api";

const KEY = ["admin", "maintenance"] as const;

export function useAdminMaintenance() {
  return useQuery({
    queryKey: [...KEY, "current"],
    queryFn: () => adminRequest("/v1/admin/maintenance", adminMaintenanceSchema),
    // A scheduled window starts on its own: keep the page current.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMaintenanceHistory(pageSize = 6) {
  return useInfiniteQuery({
    queryKey: [...KEY, "history", pageSize],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (pageParam) params.set("cursor", pageParam);
      return adminRequest(`/v1/admin/maintenance/history?${params}`, maintenanceHistorySchema);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export type MaintenanceAction =
  | { kind: "start"; input: StartMaintenanceInput }
  | { kind: "schedule"; input: ScheduleMaintenanceInput }
  | { kind: "end"; windowId: string; input: CloseMaintenanceInput }
  | { kind: "cancel"; windowId: string; input: CloseMaintenanceInput };

function send(action: MaintenanceAction) {
  const options = { method: "POST" as const, body: action.input };
  switch (action.kind) {
    case "start":
      return adminRequest("/v1/admin/maintenance/start", adminMaintenanceSchema, options);
    case "schedule":
      return adminRequest("/v1/admin/maintenance/schedule", adminMaintenanceSchema, options);
    case "end":
      return adminRequest(`/v1/admin/maintenance/${encodeURIComponent(action.windowId)}/end`, adminMaintenanceSchema, options);
    case "cancel":
      return adminRequest(`/v1/admin/maintenance/${encodeURIComponent(action.windowId)}/cancel`, adminMaintenanceSchema, options);
  }
}

export function useMaintenanceAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: (state) => {
      queryClient.setQueryData([...KEY, "current"], state);
      void queryClient.invalidateQueries({ queryKey: [...KEY, "history"] });
      void queryClient.invalidateQueries({ queryKey: SITE_STATUS_KEY });
    },
    onError: () => {
      // Someone else may have changed it (409): show the truth.
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
}
