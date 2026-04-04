import { useEffect, useState } from 'react'
import { Plus, LayoutDashboard, BarChart3, Settings as SettingsIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dashboard } from '@/components/Dashboard'
import { Analytics } from '@/components/Analytics'
import { Settings } from '@/components/Settings'
import { TransactionForm } from '@/components/TransactionForm'
import { useStore } from '@/store/useStore'
import { cn } from '@/lib/utils'
import type { Transaction } from '@/types'

function App() {
  const { initialize, isLoading, initialized, activeTab, setActiveTab, settings } = useStore()
  const [formOpen, setFormOpen] = useState(false)
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>(undefined)

  const handleEdit = (transaction: Transaction) => {
    setEditTransaction(transaction)
    setFormOpen(true)
  }

  const handleFormClose = (open: boolean) => {
    setFormOpen(open)
    if (!open) setEditTransaction(undefined)
  }

  useEffect(() => {
    initialize()
  }, [initialize])

  // Apply theme on mount and when settings change
  useEffect(() => {
    if (initialized) {
      document.documentElement.classList.toggle('dark', settings.darkMode)
    }
  }, [initialized, settings.darkMode])

  if (isLoading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-4xl mb-4">💰</div>
          <div className="text-muted-foreground">Caricamento...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-semibold hidden sm:inline">Finance Tracker</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-4 py-4 sm:py-6 sm:pl-20 lg:pl-60">
        {activeTab === 'dashboard' && <Dashboard onEditTransaction={handleEdit} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* FAB - Floating Action Button */}
      <Button
        size="fab"
        className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 shadow-xl hover:shadow-2xl transition-shadow"
        onClick={() => { setEditTransaction(undefined); setFormOpen(true) }}
      >
        <Plus className="h-6 w-6" />
        <span className="sr-only">Aggiungi transazione</span>
      </Button>

      {/* Transaction Form Dialog */}
      <TransactionForm open={formOpen} onOpenChange={handleFormClose} editTransaction={editTransaction} />

      {/* Bottom Navigation - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background sm:hidden">
        <div className="flex items-center justify-around h-16">
          <NavButton
            icon={<LayoutDashboard className="h-5 w-5" />}
            label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <NavButton
            icon={<BarChart3 className="h-5 w-5" />}
            label="Analytics"
            active={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
          />
          <NavButton
            icon={<SettingsIcon className="h-5 w-5" />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </div>
      </nav>

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden sm:fixed sm:left-0 sm:top-14 sm:bottom-0 sm:flex sm:w-16 lg:w-56 sm:flex-col sm:border-r sm:bg-background sm:p-2 lg:p-4">
        <nav className="flex flex-col gap-1">
          <SidebarButton
            icon={<LayoutDashboard className="h-5 w-5" />}
            label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarButton
            icon={<BarChart3 className="h-5 w-5" />}
            label="Analytics"
            active={activeTab === 'analytics'}
            onClick={() => setActiveTab('analytics')}
          />
          <SidebarButton
            icon={<SettingsIcon className="h-5 w-5" />}
            label="Impostazioni"
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          />
        </nav>
      </aside>
    </div>
  )
}

interface NavButtonProps {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}

function NavButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 w-20 h-full transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  )
}

function SidebarButton({ icon, label, active, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 rounded-lg transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

export default App
