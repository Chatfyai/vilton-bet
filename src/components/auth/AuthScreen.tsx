import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Loader2 } from 'lucide-react'

export function AuthScreen() {
    const [loading, setLoading] = useState(false)
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isLogin, setIsLogin] = useState(true)

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Create a fake email based on username to satisfy Supabase
        // Sanitize username to be safe for email
        const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '')
        const fakeEmail = `${cleanUsername}@vilton.bet`

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email: fakeEmail,
                    password,
                })
                if (error) {
                    // Friendly error message
                    if (error.message.includes('Invalid login')) {
                        throw new Error('Usuário ou senha incorretos.')
                    }
                    throw error
                }
            } else {
                const { error } = await supabase.auth.signUp({
                    email: fakeEmail,
                    password,
                    options: {
                        data: {
                            username: username // Save the original display name
                        }
                    }
                })
                if (error) throw error
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
            <div className="mb-8 text-center">
                <h1 className="text-4xl font-bold text-emerald-500 mb-2">Vilton da Bet</h1>
                <p className="text-gray-400">Aposte com seus amigos</p>
            </div>

            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-2xl">
                <h2 className="text-xl font-semibold text-white mb-6 text-center">
                    {isLogin ? 'Entrar' : 'Criar Conta'}
                </h2>

                <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Nome de Usuário</label>
                        <Input
                            type="text"
                            placeholder="Seu nome"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="bg-gray-950/50"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Senha</label>
                        <Input
                            type="password"
                            placeholder="******"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="bg-gray-950/50"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-sm text-red-200">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 h-11" disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isLogin ? 'Entrar' : 'Criar Conta')}
                    </Button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        className="text-sm text-emerald-500 hover:text-emerald-400 font-medium"
                    >
                        {isLogin ? 'Não tem conta? Crie agora' : 'Já tem conta? Entrar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
