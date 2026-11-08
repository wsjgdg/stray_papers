import { Route, Routes } from "react-router-dom"
import HomeRoute from "./pages/Home/index.tsx"

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="*" element={<HomeRoute />} />
    </Routes>
  )
}

export default App
