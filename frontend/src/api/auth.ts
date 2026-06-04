import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPostJson } from "./client";

export interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
  is_demo: boolean;
  is_admin: boolean;
}

/** Current session user; 401 (not logged in) surfaces as a query error. */
export function useMe() {
  return useQuery<AuthUser>({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<AuthUser>("/api/v1/auth/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<AuthUser, Error, { email: string; password: string }>({
    mutationFn: (body) => apiPostJson<AuthUser>("/api/v1/auth/login", body),
    onSuccess: (user) => qc.setQueryData(["auth", "me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => apiPostJson<{ ok: boolean }>("/api/v1/auth/logout"),
    onSuccess: () => {
      qc.clear(); // drop all cached (per-user) data on sign-out
    },
  });
}
