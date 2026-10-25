import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './holiday.css'
import './lib/holiday/store' // áp giao diện dịp lễ (nếu có) ngay khi tải trang
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
