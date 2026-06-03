import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AuthProvider } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import { AdminPage } from '@/pages/AdminPage'
import { AuthCallbackPage } from '@/pages/AuthCallbackPage'
import { CreatePoolPage } from '@/pages/CreatePoolPage'
import { HomePage } from '@/pages/HomePage'
import { JoinPoolPage } from '@/pages/JoinPoolPage'
import { LoginPage } from '@/pages/LoginPage'
import { PoolPage } from '@/pages/PoolPage'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<LoginPage />} />
                <Route path="auth/callback" element={<AuthCallbackPage />} />
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
                      <PoolPage />
                    </ProtectedRoute>
                  }
                />
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
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
