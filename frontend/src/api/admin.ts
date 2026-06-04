import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPostJson, ApiError } from "./client";

export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  is_demo: boolean;
  is_admin: boolean;
  is_active: boolean;
  plate_ids: string[];
  last_login_at: string | null;
}

export interface PlateOption {
  plate_id: string;
  plate_code: string | null;
  n_drugs: number;
  has_assets: boolean;
}

const apiDelete = async <T>(path: string): Promise<T> => {
  const res = await fetch(path, { method: "DELETE", credentials: "include", headers: { Accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `${res.status}`);
  return res.json() as Promise<T>;
};
const apiPatch = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, {
    method: "PATCH",
    credentials: "include",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status}`);
  return res.json() as Promise<T>;
};

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => apiGet<AdminUser[]>("/api/v1/admin/users"),
    retry: false,
  });
}

export function useAllPlates() {
  return useQuery<PlateOption[]>({
    queryKey: ["admin", "plates"],
    queryFn: () => apiGet<PlateOption[]>("/api/v1/admin/plates"),
    retry: false,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin", "users"] });
}

export function useCreateUser() {
  const inv = useInvalidate();
  return useMutation<AdminUser, ApiError, { email: string; password: string; display_name?: string; is_admin?: boolean }>({
    mutationFn: (b) => apiPostJson<AdminUser>("/api/v1/admin/users", b),
    onSuccess: inv,
  });
}

export function useUpdateUser() {
  const inv = useInvalidate();
  return useMutation<AdminUser, ApiError, { id: number; patch: Partial<Pick<AdminUser, "is_admin" | "is_active" | "display_name">> & { password?: string } }>({
    mutationFn: ({ id, patch }) => apiPatch<AdminUser>(`/api/v1/admin/users/${id}`, patch),
    onSuccess: inv,
  });
}

export function useDeleteUser() {
  const inv = useInvalidate();
  return useMutation<{ ok: boolean }, ApiError, number>({
    mutationFn: (id) => apiDelete<{ ok: boolean }>(`/api/v1/admin/users/${id}`),
    onSuccess: inv,
  });
}

export function useAssignPlate() {
  const inv = useInvalidate();
  return useMutation<AdminUser, ApiError, { userId: number; plateId: string }>({
    mutationFn: ({ userId, plateId }) => apiPostJson<AdminUser>(`/api/v1/admin/users/${userId}/plates`, { plate_id: plateId }),
    onSuccess: inv,
  });
}

export function useRevokePlate() {
  const inv = useInvalidate();
  return useMutation<AdminUser, ApiError, { userId: number; plateId: string }>({
    mutationFn: ({ userId, plateId }) => apiDelete<AdminUser>(`/api/v1/admin/users/${userId}/plates/${plateId}`),
    onSuccess: inv,
  });
}
