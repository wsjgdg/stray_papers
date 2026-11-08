import { Route, Routes } from "react-router-dom"
import HomeRoute from "./pages/Home/index.tsx"
import { ErrorBoundary } from "./components/ErrorBoundary.tsx"

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="*" element={<HomeRoute />} />
      </Routes>
    </ErrorBoundary>
  )
}

export default App
