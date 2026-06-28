import { RouterProvider } from 'react-router'
import { router } from './routes'
import ErrorBoundary from '../components/ErrorBoundary'
import { ToastProvider } from '../components/ToastProvider'

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </ErrorBoundary>
  )
}
