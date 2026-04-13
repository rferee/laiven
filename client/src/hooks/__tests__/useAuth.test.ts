import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock the API client — must come before importing the hook
vi.mock('@/api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          data: {
            id: '1',
            email: 'admin@laiven.local',
            displayName: 'Admin',
            role: 'instance_admin',
          },
        });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    interceptors: {
      response: { use: vi.fn() },
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isLoading true initially', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    // On first render, query is fetching
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBe(null);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('returns user when API succeeds', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual({
      id: '1',
      email: 'admin@laiven.local',
      displayName: 'Admin',
      role: 'instance_admin',
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it('exposes a refetch function', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.refetch).toBe('function');
  });
});
