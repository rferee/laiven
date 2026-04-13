import { useQuery } from '@tanstack/react-query';
import { getMe, type User } from '@/api/auth';

export function useAuth() {
  const { data: user, isLoading, refetch } = useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    refetch,
  };
}
