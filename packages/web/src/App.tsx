import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import EnvironmentDetail from './pages/EnvironmentDetail'
import Environments from './pages/Environments'
import Metrics from './pages/Metrics'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import Sidebar from './components/Sidebar'

export default function App() {
  return (
    <Router>
      <div className="flex h-screen bg-ephops-base text-ephops-text-primary">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/environments" element={<Environments />} />
            <Route path="/environments/:id" element={<EnvironmentDetail />} />
            <Route path="/metrics" element={<Metrics />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}
