import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { getRouterBasename, isSupabaseConfigured } from '@/lib/env'
import { AuthProvider } from '@/hooks/useAuth'
import { PoolHeaderTeamProvider } from '@/hooks/usePoolHeaderTeam'
import { ThemeProvider } from '@/hooks/useTheme'
import { AdminPage } from '@/pages/AdminPage'
import { CreatePoolPage } from '@/pages/CreatePoolPage'
import { FixturesPage } from '@/pages/FixturesPage'
import { LeaderboardsPage } from '@/pages/LeaderboardsPage'
import { HomePage } from '@/pages/HomePage'
import { JoinPoolPage } from '@/pages/JoinPoolPage'
import { LoginPage } from '@/pages/LoginPage'
import { PoolPage } from '@/pages/PoolPage'
import { PoolShell } from '@/pages/PoolShell'
import { WorldCupTablePage } from '@/pages/WorldCupTablePage'
import { XiGamePage } from '@/pages/XiGamePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
const basename = getRouterBasename()

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider>
        <ConfigErrorScreen />
      </ThemeProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PoolHeaderTeamProvider>
            <BrowserRouter basename={basename}>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="login" element={<LoginPage />} />
                  <Route path="join" element={<JoinPoolPage />} />
                  <Route path="join/:inviteCode" element={<JoinPoolPage />} />
                  <Route
                    path="pools/new"
                    element={
                      <ProtectedRoute>
                        <CreatePoolPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="pools/:poolId"
                    element={
                      <ProtectedRoute>
                        <PoolShell />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<PoolPage />} />
                    <Route path="table" element={<WorldCupTablePage />} />
                    <Route path="fixtures" element={<FixturesPage />} />
                    <Route path="leaderboards" element={<LeaderboardsPage />} />
                    <Route path="xi-game" element={<XiGamePage />} />
                  </Route>
                  <Route
                    path="admin"
                    element={
                      <ProtectedRoute>
                        <AdminPage />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </PoolHeaderTeamProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
