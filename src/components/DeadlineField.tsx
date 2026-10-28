import type { ReactNode } from 'react'

const times = Array.from({ length: 288 }, (_, index) => {
  const hours = Math.floor(index / 12)
  const minutes = (index % 12) * 5
  const value = String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0')
  const label = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return { value, label }
})

export function formatLocalDeadline(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    'T' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

export function roundedDeadline(date: Date): Date {
  const next = new Date(date)
  next.setSeconds(0, 0)
  next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5)
  return next
}

type Shortcut = { label: string; getValue: () => string }

export default function DeadlineField({ label, value, onChange, minDate, shortcuts, hint }: {
  label: string
  value: string
  onChange: (value: string) => void
  minDate?: string
  shortcuts: Shortcut[]
  hint?: ReactNode
}) {
  const [date = '', time = ''] = value.split('T')
  const options = time && !times.some(option => option.value === time)
    ? [{ value: time, label: time }, ...times] : times

  return <fieldset className="space-y-2">
    <legend className="field-label">{label}</legend>
    <div className="sm:hidden">
      <input aria-label={label} className="janus-input" type="datetime-local"
        value={value} onChange={event => onChange(event.target.value)} />
    </div>
    <div className="hidden sm:grid sm:grid-cols-2 sm:gap-2">
      <label className="text-xs text-[#A8B0BE]">Date
        <input className="janus-input mt-1" type="date" value={date} min={minDate}
          onChange={event => onChange(event.target.value ? event.target.value + 'T' + (time || '18:00') : '')} />
      </label>
      <label className="text-xs text-[#A8B0BE]">Time
        <select className="janus-input mt-1" value={date ? time : ''} disabled={!date}
          onChange={event => onChange(date + 'T' + event.target.value)}>
          <option value="">Choose time</option>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      {shortcuts.map(shortcut => <button key={shortcut.label} type="button"
        className="min-h-9 rounded-lg border border-white/15 px-3 text-xs text-[#C8CDD6] hover:bg-white/[0.06]"
        onClick={() => onChange(shortcut.getValue())}>{shortcut.label}</button>)}
    </div>
    {hint && <p className="text-xs text-[#77808F]">{hint}</p>}
  </fieldset>
}
