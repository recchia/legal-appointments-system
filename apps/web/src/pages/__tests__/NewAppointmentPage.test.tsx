import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { NewAppointmentPage } from '../NewAppointmentPage';
import * as apiModule from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: {
    lawyers: {
      list: vi.fn(),
      getById: vi.fn(),
    },
    calendar: { get: vi.fn() },
    appointments: {
      create: vi.fn(),
      getById: vi.fn(),
    },
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLawyers = [
  {
    id: 'lawyer-1',
    fullName: 'María González',
    email: 'maria@test.com',
    timezone: 'America/Argentina/Buenos_Aires',
    specialties: [],
    countryId: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NewAppointmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.api.lawyers.list).mockResolvedValue(mockLawyers);
  });

  it('renders the form heading', async () => {
    renderWithProviders(<NewAppointmentPage />);
    expect(screen.getByRole('heading', { name: /new appointment/i })).toBeInTheDocument();
  });

  it('renders all three appointment type buttons', async () => {
    renderWithProviders(<NewAppointmentPage />);
    expect(screen.getByText(/In person/i)).toBeInTheDocument();
    expect(screen.getByText(/Video call/i)).toBeInTheDocument();
    expect(screen.getByText(/Phone call/i)).toBeInTheDocument();
  });

  it('selects appointment type when button is clicked', async () => {
    renderWithProviders(<NewAppointmentPage />);

    const inPersonBtn = screen.getByText(/In person/i);
    fireEvent.click(inPersonBtn);

    // Button should have primary styling after click
    expect(inPersonBtn.closest('button')).toHaveClass('btn--primary');
  });

  it('shows validation error when submitting without required fields', async () => {
    renderWithProviders(<NewAppointmentPage />);

    // Use fireEvent.submit on the form directly — jsdom doesn't fully enforce
    // HTML5 constraint validation (required attributes) when clicking a Submit
    // button, so the onSubmit handler might not fire. Submitting the form
    // element directly bypasses constraint validation and hits our handler.
    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText(/Please fill in all required fields/i)).toBeInTheDocument();
    });
  });

  it('populates lawyer dropdown after fetch', async () => {
    renderWithProviders(<NewAppointmentPage />);

    await waitFor(() => {
      expect(screen.getByText(/María González/i)).toBeInTheDocument();
    });
  });
});
