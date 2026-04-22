import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { LawyersPage } from './pages/LawyersPage';
import { LawyerCalendarPage } from './pages/LawyerCalendarPage';
import { NewAppointmentPage } from './pages/NewAppointmentPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar__logo">
        legal<span>.</span>appointments
      </div>
      <nav className="topbar__nav">
        <NavLink
          to="/lawyers"
          className={({ isActive }) => `topbar__link${isActive ? ' active' : ''}`}
        >
          Lawyers
        </NavLink>
        <NavLink
          to="/appointments/new"
          className={({ isActive }) => `topbar__link${isActive ? ' active' : ''}`}
        >
          New appointment
        </NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="layout">
          <TopBar />
          <main>
            <Routes>
              <Route path="/" element={<LawyersPage />} />
              <Route path="/lawyers" element={<LawyersPage />} />
              <Route path="/lawyers/:id/calendar" element={<LawyerCalendarPage />} />
              <Route path="/appointments/new" element={<NewAppointmentPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
