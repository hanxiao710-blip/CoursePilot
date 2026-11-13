import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Planner from './pages/Planner'
import StudyAssistant from './pages/StudyAssistant'
import Vocabulary from './pages/Vocabulary'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function App() {
  return (
    <Routes>
      {/* ── Public auth routes (no Layout shell) ── */}
      <Route path="/login"           element={<Login />} />
      <Route path="/register"        element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password"  element={<ResetPassword />} />

      {/* ── Protected app routes (wrapped in Layout) ── */}
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="planner"         element={<Planner />} />
        <Route path="study-assistant" element={<StudyAssistant />} />
        <Route path="vocabulary"      element={<Vocabulary />} />
        {/* Redirect old standalone page → Planner (which now hosts the import) */}
        <Route path="syllabus-import" element={<Navigate to="/planner" replace />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
