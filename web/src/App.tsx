import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/AdminLayout'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { useMe } from './lib/auth'
import { AdminAccountsPage } from './pages/AdminAccountsPage'
import { AdminChannelsPage } from './pages/AdminChannelsPage'
import { AdminTokensPage } from './pages/AdminTokensPage'
import { ChannelPage } from './pages/ChannelPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) return null
  if (!me?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="channels/:slug" element={<ChannelPage />} />
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="/admin/accounts" replace />} />
            <Route path="accounts" element={<AdminAccountsPage />} />
            <Route path="channels" element={<AdminChannelsPage />} />
            <Route path="tokens" element={<AdminTokensPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
