"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createContext, useContext, useState } from "react";
import type { User } from "@supabase/supabase-js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
  },
});

const UserContext = createContext<User | null>(null);
export function useCurrentUser() { return useContext(UserContext); }

export function Providers({ children, user }: { children: React.ReactNode; user?: User | null }) {
  return (
    <QueryClientProvider client={queryClient}>
      <UserContext.Provider value={user ?? null}>
        {children}
      </UserContext.Provider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
