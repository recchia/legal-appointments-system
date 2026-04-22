import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { AppointmentType } from '@legal-appointments/shared';

const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Mexico_City',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'America/Sao_Paulo',
  'Europe/Madrid',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const TYPE_OPTIONS = [
  { value: AppointmentType.IN_PERSON, label: '🏛 In person' },
  { value: AppointmentType.VIDEO, label: '📹 Video call' },
  { value: AppointmentType.PHONE, label: '📞 Phone call' },
];

function toUtcIso(localDatetime: string, timezone: string): string {
  // localDatetime is "YYYY-MM-DDTHH:mm" from <input type="datetime-local">
  // We need to convert it to a UTC ISO string treating it as the given timezone.
  // We use Intl to figure out the offset.
  const naive = new Date(localDatetime);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });

  // Get the offset by comparing local interpretation vs UTC
  const parts = formatter.formatToParts(naive);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  const localStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

  const diff = naive.getTime() - new Date(localStr + 'Z').getTime();
  return new Date(naive.getTime() - diff).toISOString();
}

export function NewAppointmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [lawyerId, setLawyerId] = useState('');
  const [clientId, setClientId] = useState('');
  const [type, setType] = useState<string>(AppointmentType.VIDEO);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [timezone, setTimezone] = useState('America/Argentina/Buenos_Aires');
  const [notes, setNotes] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: lawyers, isLoading: lawyersLoading } = useQuery({
    queryKey: ['lawyers'],
    queryFn: api.lawyers.list,
  });

  const mutation = useMutation({
    mutationFn: api.appointments.create,
    onSuccess: (apt) => {
      queryClient.invalidateQueries({ queryKey: ['calendar', lawyerId] });
      navigate(`/lawyers/${lawyerId}/calendar`);
      void apt;
    },
    onError: (err: Error & { detail?: { message?: string } }) => {
      setApiError(err.detail?.message ?? err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!lawyerId || !clientId || !startDate || !endDate) {
      setApiError('Please fill in all required fields.');
      return;
    }

    const startsAtUtc = toUtcIso(startDate, timezone);
    const endsAtUtc = toUtcIso(endDate, timezone);

    mutation.mutate({
      lawyerId,
      clientId,
      type: type as keyof typeof AppointmentType,
      startsAtUtc,
      endsAtUtc,
      notes: notes || undefined,
    });
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: 20 }}>
        <Link to="/lawyers" className="muted" style={{ fontSize: '0.85rem' }}>
          ← Lawyers
        </Link>
      </div>

      <h1 style={{ marginBottom: 6 }}>New appointment</h1>
      <p>Schedule an appointment between a lawyer and a client.</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Lawyer */}
        <div className="field">
          <label className="label" htmlFor="lawyer">Lawyer *</label>
          <select
            id="lawyer"
            className="input"
            value={lawyerId}
            onChange={e => setLawyerId(e.target.value)}
            required
            disabled={lawyersLoading}
          >
            <option value="">Select a lawyer…</option>
            {lawyers?.map(l => (
              <option key={l.id} value={l.id}>
                {l.fullName} ({l.timezone})
              </option>
            ))}
          </select>
        </div>

        {/* Client ID — manual UUID input for now */}
        <div className="field">
          <label className="label" htmlFor="client">Client UUID *</label>
          <input
            id="client"
            className="input mono"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            required
          />
          <span className="field-error" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Paste a client UUID from the database (client management UI coming soon)
          </span>
        </div>

        {/* Type */}
        <div className="field">
          <label className="label">Type *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`btn ${type === opt.value ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Timezone */}
        <div className="field">
          <label className="label" htmlFor="timezone">Appointment timezone</label>
          <select
            id="timezone"
            className="input"
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <span className="field-error" style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Times below are interpreted in this timezone
          </span>
        </div>

        {/* Start / end */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="field">
            <label className="label" htmlFor="start">Start *</label>
            <input
              id="start"
              type="datetime-local"
              className="input"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="end">End *</label>
            <input
              id="end"
              type="datetime-local"
              className="input"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Notes */}
        <div className="field">
          <label className="label" htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            className="input"
            rows={3}
            placeholder="Optional context for this appointment…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Error */}
        {apiError && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--danger-dim)',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--danger)',
            fontSize: '0.875rem',
          }}>
            {apiError}
          </div>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: 12, paddingTop: 4 }}>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={mutation.isPending}
            style={{ minWidth: 160 }}
          >
            {mutation.isPending ? 'Booking…' : 'Book appointment'}
          </button>
          <Link to="/lawyers" className="btn btn--ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
