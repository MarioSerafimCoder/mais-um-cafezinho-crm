import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { CampaignsPage } from './pages/CampaignsPage'
import { DashboardPage } from './pages/DashboardPage'
import { SettingsPage } from './pages/SettingsPage'
import { SubscribersPage } from './pages/SubscribersPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { LoadingState } from './components/ui'

const EditorPage = lazy(() => import('./pages/EditorPage').then((module) => ({ default: module.EditorPage })))

export default function App() {
  return <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="campaigns" element={<CampaignsPage />} />
      <Route path="editor/:id" element={<Suspense fallback={<LoadingState label="Abrindo o editor…" />}><EditorPage /></Suspense>} />
      <Route path="subscribers" element={<SubscribersPage />} />
      <Route path="templates" element={<TemplatesPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
}
