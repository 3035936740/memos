import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { instanceServiceClient } from "@/connect";

export const stylePackKeys = {
  all: ["style-packs"] as const,
  list: (includeDisabled: boolean) => [...stylePackKeys.all, { includeDisabled }] as const,
};

/** The enabled style packs, which anyone may read. */
export function useStylePacks() {
  return useQuery({
    queryKey: stylePackKeys.list(false),
    queryFn: async () => (await instanceServiceClient.listStylePacks({})).stylePacks,
    staleTime: 5 * 60 * 1000,
  });
}

/** Every installed pack, disabled ones included; admins only. */
export function useAllStylePacks(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: stylePackKeys.list(true),
    queryFn: async () => (await instanceServiceClient.listStylePacks({ includeDisabled: true })).stylePacks,
    enabled: options?.enabled ?? true,
  });
}

export function useInstallStylePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (zip: Uint8Array) => instanceServiceClient.installStylePack({ zip }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stylePackKeys.all }),
  });
}

export function useUpdateStylePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: { id: string; enabled?: boolean; zip?: Uint8Array }) =>
      instanceServiceClient.updateStylePack({ id: request.id, enabled: request.enabled, zip: request.zip ?? new Uint8Array() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stylePackKeys.all }),
  });
}

export function useDeleteStylePack() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => instanceServiceClient.deleteStylePack({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stylePackKeys.all }),
  });
}
