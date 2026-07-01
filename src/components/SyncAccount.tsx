import { useEffect, useState } from 'react'
import { RefreshCw, LogOut, Cloud, CloudOff, Check, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { syncNow, getSyncStatus, subscribeSync, type SyncStatus } from '@/lib/sync'
import { dbOperations } from '@/lib/db'

function StatusLine({ status, lastError, lastSyncedAt }: { status: SyncStatus; lastError: string | null; lastSyncedAt: number }) {
  const when = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null
  if (status === 'syncing') return <span className="flex items-center gap-1 text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sincronizzazione...</span>
  if (status === 'error') return <span className="flex items-center gap-1 text-destructive"><AlertCircle className="h-3.5 w-3.5" /> Errore: {lastError}</span>
  if (status === 'offline') return <span className="flex items-center gap-1 text-warning"><CloudOff className="h-3.5 w-3.5" /> Offline — sincronizzerà al ritorno online</span>
  return <span className="flex items-center gap-1 text-success"><Check className="h-3.5 w-3.5" /> {when ? `Sincronizzato · ${when}` : 'Pronto'}</span>
}

export function SyncAccount() {
  const { configured, user, signOut } = useAuthStore()
  const [{ status, lastError }, setState] = useState(getSyncStatus())
  const [lastSyncedAt, setLastSyncedAt] = useState(0)

  useEffect(() => {
    const refresh = async () => {
      setState(getSyncStatus())
      setLastSyncedAt(await dbOperations.getSyncMeta('lastSyncedAt'))
    }
    void refresh()
    return subscribeSync(() => void refresh())
  }, [])

  if (!configured) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          Account e sincronizzazione
        </CardTitle>
        <CardDescription>{user?.email ?? 'Accesso'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm">
          <StatusLine status={status} lastError={lastError} lastSyncedAt={lastSyncedAt} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void syncNow()} disabled={status === 'syncing'}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Sincronizza ora
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4 mr-2" />
            Esci
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
