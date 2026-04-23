import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { LawyersPage } from '../LawyersPage';
import * as apiModule from '../../lib/api';

// Mock the entire api module
vi.mock('../../lib/api', () => ({
  api: {
    lawyers: {
      list: vi.fn(),
      getById: vi.fn(),
    },
    calendar: {
      get: vi.fn(),
    },
    appointments: {
      create: vi.fn(),
      getById: vi.fn(),
    },
  },
}));

const mockLawyers = [
  {
    id: 'lawyer-1',
    fullName: 'María González',
    email: 'maria@test.com',
    timezone: 'America/Argentina/Buenos_Aires',
    specialties: ['Corporate', 'M&A'],
    countryId: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    country: {
      id: 1,
      code: 'AR',
      name: 'Argentina',
      defaultTimezone: 'America/Argentina/Buenos_Aires',
    },
  },
  {
    id: 'lawyer-2',
    fullName: 'Carlos Ramírez',
    email: 'carlos@test.com',
    timezone: 'America/Mexico_City',
    specialties: ['Immigration'],
    countryId: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    country: {
      id: 2,
      code: 'MX',
      name: 'México',
      defaultTimezone: 'America/Mexico_City',
    },
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LawyersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    vi.mocked(apiModule.api.lawyers.list).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<LawyersPage />);
    expect(document.querySelector('.spinner')).toBeTruthy();
  });

  it('renders lawyers after successful fetch', async () => {
    vi.mocked(apiModule.api.lawyers.list).mockResolvedValue(mockLawyers);
    renderWithProviders(<LawyersPage />);

    await waitFor(() => {
      expect(screen.getByText('María González')).toBeInTheDocument();
      expect(screen.getByText('Carlos Ramírez')).toBeInTheDocument();
    });
  });

  it('renders specialties as tags', async () => {
    vi.mocked(apiModule.api.lawyers.list).mockResolvedValue(mockLawyers);
    renderWithProviders(<LawyersPage />);

    await waitFor(() => {
      expect(screen.getByText('Corporate')).toBeInTheDocument();
      expect(screen.getByText('M&A')).toBeInTheDocument();
      expect(screen.getByText('Immigration')).toBeInTheDocument();
    });
  });

  it('shows error message when fetch fails', async () => {
    vi.mocked(apiModule.api.lawyers.list).mockRejectedValue(new Error('Network error'));
    renderWithProviders(<LawyersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load lawyers/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no lawyers', async () => {
    vi.mocked(apiModule.api.lawyers.list).mockResolvedValue([]);
    renderWithProviders(<LawyersPage />);

    await waitFor(() => {
      expect(screen.getByText('No lawyers found.')).toBeInTheDocument();
    });
  });

  it('renders "View calendar" link for each lawyer', async () => {
    vi.mocked(apiModule.api.lawyers.list).mockResolvedValue(mockLawyers);
    renderWithProviders(<LawyersPage />);

    await waitFor(() => {
      const calendarLinks = screen.getAllByText(/View calendar/i);
      expect(calendarLinks).toHaveLength(2);
    });
  });
});
