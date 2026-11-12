import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Planner from './pages/Planner'
import StudyAssistant from './pages/StudyAssistant'
import Vocabulary from './pages/Vocabulary'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="planner" element={<Planner />} />
        <Route path="study-assistant" element={<StudyAssistant />} />
        <Route path="vocabulary" element={<Vocabulary />} />
      </Route>
    </Routes>
  )
}

export default App
