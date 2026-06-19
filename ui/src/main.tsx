import { createRoot } from 'react-dom/client'
import { RouterProvider } from './react-router'
import { router } from './app/routes'
import './styles.css'

createRoot(document.getElementById('root') as HTMLElement).render(
  <RouterProvider router={router} />
)
