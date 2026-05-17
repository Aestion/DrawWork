import { BrowserRouter, Routes, Route } from 'react-router-dom'
import AuthPage from './pages/AuthPage'
import DashboardPage from './pages/DashboardPage'
import EditorPage from './pages/EditorPage'
import ShareRedirectPage from './pages/ShareRedirectPage'

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="/" element={<DashboardPage />} />
        <Route path="/board/:boardId" element={<EditorPage />} />
        <Route path="/s/:token" element={<ShareRedirectPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
