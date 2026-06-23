import { Settings, Wrench } from "lucide-react"

export default function SettingsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="page-title flex items-center gap-3">
          <Settings size={28} strokeWidth={1.75} className="text-text-secondary" aria-hidden="true" />
          Einstellungen
        </h1>
        <p className="mt-1.5 text-sm text-text-secondary">
          Zentrale Konfiguration des Campaign Managers. Weitere Optionen folgen hier nach und nach.
        </p>
      </div>

      <div className="card p-8">
        <div className="flex flex-col items-center justify-center text-center py-16 px-6">
          <Wrench size={32} strokeWidth={1.5} className="text-text-secondary/50 mb-4" aria-hidden="true" />
          <p className="text-sm font-medium text-text-primary">Noch keine Einstellungen verfügbar</p>
          <p className="mt-1 max-w-sm text-sm text-text-secondary">
            Weitere Einstellungen folgen. Sobald Optionen verfügbar sind, erscheinen sie an dieser Stelle.
          </p>
        </div>
      </div>
    </div>
  )
}
