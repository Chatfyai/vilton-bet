import { AuthProvider, useAuth } from './lib/auth'
import { AuthScreen } from './components/auth/AuthScreen'
import { AdminDashboard } from './components/admin/AdminDashboard'
import { UserDashboard } from './components/user/UserDashboard'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

function AppContent() {
    const { user, loading: authLoading, signOut } = useAuth()
    const [isAdmin, setIsAdmin] = useState(false)
    const [checkingRole, setCheckingRole] = useState(false)

    useEffect(() => {
        if (user) {
            checkUserRole()
        }
    }, [user])

    async function checkUserRole() {
        setCheckingRole(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user!.id)
                .maybeSingle() // Use maybeSingle instead of single to handle no rows gracefully

            if (error) {
                console.error('Error checking role:', error)
                // Default to user if error, don't block app
            }

            if (data?.role === 'admin') {
                setIsAdmin(true)
            }
        } catch (err) {
            console.error('Unexpected error checking role:', err)
        } finally {
            setCheckingRole(false)
        }
    }

    if (authLoading || checkingRole) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
            </div>
        )
    }

    if (!user) {
        return <AuthScreen />
    }

    if (isAdmin) {
        return (
            <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
                <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto w-full border-b border-gray-800 pb-4">
                    <div>
                        <div className="bg-red-900/20 text-red-200 inline-block px-2 py-0.5 rounded text-xs uppercase tracking-wider font-bold mb-1 border border-red-900/30">
                            Modo Administrador
                        </div>
                        <h1 className="text-2xl font-bold text-emerald-400">Vilton da Bet</h1>
                    </div>
                    <button
                        onClick={() => signOut()}
                        className="text-sm bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-800 transition-colors"
                    >
                        Sair
                    </button>
                </header>
                <AdminDashboard />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white p-4 md:p-8">
            <header className="flex items-center justify-between mb-8 max-w-4xl mx-auto w-full">
                <div>
                    <h1 className="text-2xl font-bold text-emerald-400">Vilton da Bet</h1>
                    <p className="text-gray-400 text-sm">Bem-vindo, {user.user_metadata.username || 'Apostador'}</p>
                </div>
                <button
                    onClick={() => signOut()}
                    className="text-sm text-gray-400 hover:text-white"
                >
                    Sair
                </button>
            </header>

            <UserDashboard userId={user.id} />
        </div>
    )
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    )
}

export default App
