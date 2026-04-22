import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Lawyer } from '@legal-appointments/shared';

function SpecialtyTag({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      background: 'var(--accent-dim)',
      color: 'var(--accent)',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 500,
      marginRight: 4,
    }}>
      {label}
    </span>
  );
}

function LawyerRow({ lawyer }: { lawyer: Lawyer }) {
  return (
    <tr>
      <td>
        <div style={{ fontWeight: 500 }}>{lawyer.fullName}</div>
        <div className="mono secondary">{lawyer.email}</div>
      </td>
      <td>
        <div style={{ fontSize: '0.85rem' }}>{lawyer.country?.name ?? '—'}</div>
        <div className="mono muted" style={{ fontSize: '0.78rem' }}>
          {lawyer.timezone}
        </div>
      </td>
      <td>
        {lawyer.specialties.length > 0
          ? lawyer.specialties.map((s) => <SpecialtyTag key={s} label={s} />)
          : <span className="muted">—</span>
        }
      </td>
      <td>
        <Link
          to={`/lawyers/${lawyer.id}/calendar`}
          className="btn btn--ghost"
          style={{ padding: '5px 12px', fontSize: '0.8rem' }}
        >
          View calendar →
        </Link>
      </td>
    </tr>
  );
}

export function LawyersPage() {
  const { data: lawyers, isLoading, error } = useQuery({
    queryKey: ['lawyers'],
    queryFn: api.lawyers.list,
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Lawyers</h1>
          <p style={{ marginBottom: 0 }}>
            Manage attorneys and view their appointment calendars.
          </p>
        </div>
        <Link to="/appointments/new" className="btn btn--primary">
          + New appointment
        </Link>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}

        {error && (
          <div className="empty-state" style={{ color: 'var(--danger)' }}>
            Failed to load lawyers. Is the API running?
          </div>
        )}

        {lawyers && lawyers.length === 0 && (
          <div className="empty-state">No lawyers found.</div>
        )}

        {lawyers && lawyers.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
              <tr>
                <th>Lawyer</th>
                <th>Location / timezone</th>
                <th>Specialties</th>
                <th></th>
              </tr>
              </thead>
              <tbody>
              {lawyers.map((l) => <LawyerRow key={l.id} lawyer={l} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
