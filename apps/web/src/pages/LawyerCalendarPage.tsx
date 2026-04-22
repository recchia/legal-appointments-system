import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Appointment } from '@legal-appointments/shared';

function formatLocalTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadge(status: string) {
  return (
    <span className={`badge badge--${status.toLowerCase()}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    IN_PERSON: '🏛 In person',
    VIDEO: '📹 Video',
    PHONE: '📞 Phone',
  };
  return map[type] ?? type;
}

function AppointmentCard({ apt }: { apt: Appointment & { startsAtLocal?: { lawyer: string }; endsAtLocal?: { lawyer: string } } }) {
  const start = apt.startsAtLocal?.lawyer ?? apt.startsAtUtc;
  const end = apt.endsAtLocal?.lawyer ?? apt.endsAtUtc;

  return (
    <div className={`apt-card apt-card--${apt.status.toLowerCase()}`}>
      <div className="apt-card__time">
        {formatLocalTime(start)} – {formatLocalTime(end)}
        <span className="muted" style={{ marginLeft: 8 }}>
          ({apt.lawyerTimezoneSnapshot})
        </span>
      </div>
      <div className="apt-card__title">
        {apt.client
          ? (apt.client as { fullName: string }).fullName
          : 'Client'}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="apt-card__meta">{typeLabel(apt.type)}</span>
        {statusBadge(apt.status)}
      </div>
      {apt.clientTimezoneSnapshot !== apt.lawyerTimezoneSnapshot && (
        <div className="apt-card__meta" style={{ color: 'var(--text-muted)' }}>
          Client time: {formatLocalTime(apt.endsAtLocal?.client ?? apt.endsAtUtc)} ({apt.clientTimezoneSnapshot})
        </div>
      )}
    </div>
  );
}

function groupByDate(appointments: Appointment[]): Map<string, Appointment[]> {
  const groups = new Map<string, Appointment[]>();
  for (const apt of appointments) {
    const day = apt.startsAtUtc.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(apt);
  }
  return groups;
}

export function LawyerCalendarPage() {
  const { id } = useParams<{ id: string }>();

  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const { data: lawyer } = useQuery({
    queryKey: ['lawyers', id],
    queryFn: () => api.lawyers.getById(id!),
    enabled: !!id,
  });

  const { data: appointments, isLoading } = useQuery({
    queryKey: ['calendar', id, weekOffset],
    queryFn: () => api.calendar.get(
      id!,
      weekStart.toISOString(),
      weekEnd.toISOString(),
    ),
    enabled: !!id,
  });

  const grouped = groupByDate(appointments ?? []);
  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div style={{ marginBottom: 6 }}>
            <Link to="/lawyers" className="muted" style={{ fontSize: '0.85rem' }}>
              ← Lawyers
            </Link>
          </div>
          <h1>{lawyer?.fullName ?? 'Calendar'}</h1>
          {lawyer && (
            <p style={{ marginBottom: 0 }}>
              {lawyer.timezone} · {lawyer.specialties.join(', ')}
            </p>
          )}
        </div>
        <Link to="/appointments/new" className="btn btn--primary">
          + New appointment
        </Link>
      </div>

      {/* Week navigator */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
      }}>
        <button className="btn btn--ghost" onClick={() => setWeekOffset(w => w - 1)}>←</button>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: 200, textAlign: 'center' }}>
          {weekLabel}
        </span>
        <button className="btn btn--ghost" onClick={() => setWeekOffset(w => w + 1)}>→</button>
        {weekOffset !== 0 && (
          <button className="btn btn--ghost" onClick={() => setWeekOffset(0)}>Today</button>
        )}
      </div>

      {isLoading && (
        <div className="empty-state"><div className="spinner" /></div>
      )}

      {!isLoading && grouped.size === 0 && (
        <div className="card empty-state">
          No appointments this week.
        </div>
      )}

      {!isLoading && grouped.size > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(grouped.entries()).map(([day, apts]) => (
            <div key={day}>
              <div style={{
                fontSize: '0.8rem',
                fontWeight: 500,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 10,
              }}>
                {formatDate(day)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {apts.map(apt => <AppointmentCard key={apt.id} apt={apt as never} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
