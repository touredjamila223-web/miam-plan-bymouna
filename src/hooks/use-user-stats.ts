import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUserStats } from "@/lib/recipes.functions";
import { useAuth } from "@/hooks/use-auth";
import { DIETARY_RESTRICTIONS } from "@/lib/constants";

export function useUserStats() {
  const { user } = useAuth();
  const fn = useServerFn(getUserStats);
  return useQuery({
    queryKey: ["user-stats", !!user],
    queryFn: () => fn(),
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function restrictionLabels(ids: string[]) {
  return ids.map((id) => DIETARY_RESTRICTIONS.find((d) => d.id === id)?.label ?? id);
}