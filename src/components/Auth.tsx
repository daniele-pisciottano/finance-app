import { useState } from 'react'
import { LogIn, UserPlus, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/store/authStore'

export function Auth() {
  const { signIn, signUp, error, loading, clearError } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [info, setInfo] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setInfo(null)
    if (!email || !password) return
    if (mode === 'login') {
      await signIn(email, password)
    } else {
      const res = await signUp(email, password)
      if (res.ok && res.needsConfirmation) {
        setInfo('Ti abbiamo inviato una email di conferma. Confermala e poi accedi.')
        setMode('login')
      }
    }
  }

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m)
    clearError()
    setInfo(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">💰</div>
          <CardTitle>Finance Tracker</CardTitle>
          <CardDescription>
            {mode === 'login' ? 'Accedi per sincronizzare i tuoi dati' : 'Crea un account per iniziare'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="tu@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded p-2">{error}</div>
            )}
            {info && (
              <div className="text-sm text-success bg-success/10 rounded p-2">{info}</div>
            )}

            <Button type="submit" className="w-full" disabled={loading || !email || !password}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : mode === 'login' ? (
                <>
                  <LogIn className="h-4 w-4 mr-2" /> Accedi
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" /> Registrati
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-muted-foreground mt-4">
            {mode === 'login' ? (
              <>
                Non hai un account?{' '}
                <button className="text-primary font-medium" onClick={() => switchMode('signup')}>
                  Registrati
                </button>
              </>
            ) : (
              <>
                Hai già un account?{' '}
                <button className="text-primary font-medium" onClick={() => switchMode('login')}>
                  Accedi
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
