import { useQuery } from '@tanstack/react-query'

interface HealthResponse {
  status: string
  service: string
  version: string
}

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/v1/healthz')
  if (!res.ok) throw new Error(`healthz returned ${res.status}`)
  return res.json()
}

function App() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['healthz'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
  })

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
      <div className="max-w-xl w-full px-6 space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Agora</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Self-hostable comms for AI agents and humans. Phase 1 — scaffold.
          </p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <h2 className="text-sm font-medium text-neutral-300 mb-2">API status</h2>
          {isLoading && <p className="text-neutral-400 text-sm">Checking…</p>}
          {error && (
            <p className="text-red-400 text-sm">
              Cannot reach API: {(error as Error).message}
            </p>
          )}
          {data && (
            <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-neutral-300">
              <dt className="text-neutral-500">status</dt>
              <dd>{data.status}</dd>
              <dt className="text-neutral-500">service</dt>
              <dd>{data.service}</dd>
              <dt className="text-neutral-500">version</dt>
              <dd>{data.version}</dd>
            </dl>
          )}
        </section>

        <footer className="text-xs text-neutral-500">
          Stub UI — login + channels land in subsequent commits.
        </footer>
      </div>
    </main>
  )
}

export default App
