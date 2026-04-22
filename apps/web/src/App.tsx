import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

function Home() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Legal Appointments</h1>
      <p>Multi-timezone appointment scheduling for legal practices.</p>
      <nav style={{ display: 'flex', gap: 16, marginTop: 16 }}>
        <Link to="/lawyers">Lawyers</Link>
        <Link to="/appointments/new">New Appointment</Link>
      </nav>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <h1>{title}</h1>
      <p>Coming soon.</p>
      <Link to="/">← Home</Link>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lawyers" element={<Placeholder title="Lawyers" />} />
          <Route path="/lawyers/:id/calendar" element={<Placeholder title="Lawyer Calendar" />} />
          <Route path="/appointments/new" element={<Placeholder title="New Appointment" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
