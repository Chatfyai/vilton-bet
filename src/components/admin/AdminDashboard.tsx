import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Plus, Trophy, Users, CheckCircle, PlayCircle, Timer } from 'lucide-react'

interface Player {
    id: string
    name: string
}

interface Match {
    id: string
    player_a: { name: string }
    player_b: { name: string }
    game_type: string
    scheduled_at: string
    status: string
    score_a?: number
    score_b?: number
}

export function AdminDashboard() {
    const [players, setPlayers] = useState<Player[]>([])
    const [activeMatches, setActiveMatches] = useState<Match[]>([])
    const [finishedMatches, setFinishedMatches] = useState<Match[]>([])
    const [loading, setLoading] = useState(false)

    // Create Match Form State
    const [playerA, setPlayerA] = useState('')
    const [playerB, setPlayerB] = useState('')


    // Add Player Form State
    const [newPlayerName, setNewPlayerName] = useState('')
    const [newPlayerCategory, setNewPlayerCategory] = useState('home')
    const [addingPlayer, setAddingPlayer] = useState(false)

    // Finish Match State
    const [finishingMatchId, setFinishingMatchId] = useState<string | null>(null)
    const [scoreA, setScoreA] = useState('')
    const [scoreB, setScoreB] = useState('')
    const [possessionA, setPossessionA] = useState('')
    const [possessionB, setPossessionB] = useState('')

    useEffect(() => {
        fetchPlayers()
        fetchMatches()

        // Subscribe to realtime updates
        const subscription = supabase
            .channel('admin-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchMatches)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchPlayers)
            .subscribe()

        return () => { subscription.unsubscribe() }
    }, [])

    async function fetchPlayers() {
        const { data } = await supabase.from('players').select('id, name').order('name')
        if (data) setPlayers(data)
    }

    async function fetchMatches() {
        const { data } = await supabase
            .from('matches')
            .select(`
        id, 
        game_type, 
        scheduled_at, 
        status,
        score_a,
        score_b,
        player_a:players!matches_player_a_id_fkey(name),
        player_b:players!matches_player_b_id_fkey(name)
      `)
            .order('scheduled_at', { ascending: false }) // Show newest first

        if (data) {
            setActiveMatches(data.filter(m => m.status === 'open') as any)
            setFinishedMatches(data.filter(m => m.status === 'finished') as any)
        }
    }

    async function handleAddPlayer(e: React.FormEvent) {
        e.preventDefault()
        setAddingPlayer(true)
        try {
            const { error } = await supabase.from('players').insert({
                name: newPlayerName,
                category: newPlayerCategory
            })
            if (error) throw error
            setNewPlayerName('')
            alert('Jogador adicionado!')
        } catch (error: any) {
            alert('Erro: ' + error.message)
        } finally {
            setAddingPlayer(false)
        }
    }

    async function handleCreateMatch(e: React.FormEvent) {
        e.preventDefault()
        if (playerA === playerB) {
            alert('Selecione jogadores diferentes!')
            return
        }
        setLoading(true)

        try {
            // 1. Create Match
            const { data: match, error: matchError } = await supabase
                .from('matches')
                .insert({
                    player_a_id: playerA,
                    player_b_id: playerB,
                    game_type: 'FIFA', // Default or could be 'Futebol'
                    scheduled_at: new Date().toISOString(), // Current time
                    status: 'open'
                })
                .select()
                .single()

            if (matchError) throw matchError

            // 2. Generate Odds
            // Calculate dynamic odds from history
            const { data: oddStats, error: statsError } = await supabase
                .rpc('calculate_player_odds', {
                    p_player_a_id: playerA,
                    p_player_b_id: playerB
                })

            if (statsError) console.error('Error calculating odds:', statsError)

            // Use calculated odds or defaults if error
            const odds = oddStats || {
                odd_a: 1.90, odd_b: 2.50, odd_draw: 3.00,
                prob_a: 0.5, prob_b: 0.2, prob_draw: 0.3
            }

            console.log('Dynamic Odds:', odds)

            const oddsData = [
                // Match Winner
                { match_id: match.id, market_type: 'match_winner', selection: 'home', value: odds.odd_a, probability: odds.prob_a },
                { match_id: match.id, market_type: 'match_winner', selection: 'draw', value: odds.odd_draw, probability: odds.prob_draw },
                { match_id: match.id, market_type: 'match_winner', selection: 'away', value: odds.odd_b, probability: odds.prob_b },

                // Possession (Derived simple logic: Fav to win usually has more possession, or balanced)
                // For simplicity, we keep possession relatively balanced but favor the stronger player slightly
                { match_id: match.id, market_type: 'possession', selection: 'home', value: 1.85, probability: 0.5 },
                { match_id: match.id, market_type: 'possession', selection: 'away', value: 1.85, probability: 0.5 },
                { match_id: match.id, market_type: 'possession', selection: 'equal', value: 8.00, probability: 0.1 },

                // Exact Score (Standard for now, could be dynamic later)
                { match_id: match.id, market_type: 'exact_score', selection: '1-0', value: 5.00, probability: 0.15 },
                { match_id: match.id, market_type: 'exact_score', selection: '2-0', value: 7.50, probability: 0.10 },
                { match_id: match.id, market_type: 'exact_score', selection: '2-1', value: 8.00, probability: 0.10 },
                { match_id: match.id, market_type: 'exact_score', selection: '0-1', value: 6.00, probability: 0.12 },
                { match_id: match.id, market_type: 'exact_score', selection: '1-1', value: 5.50, probability: 0.14 },
                { match_id: match.id, market_type: 'exact_score', selection: '0-0', value: 9.00, probability: 0.08 },
            ]

            const { error: oddsError } = await supabase.from('odds').insert(oddsData)
            if (oddsError) throw oddsError

            alert('Partida Criada!')
            setPlayerA('')
            setPlayerB('')
        } catch (error: any) {
            alert('Erro ao criar partida: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleFinishMatch(matchId: string) {
        if (!scoreA || !scoreB) {
            alert('Por favor, informe o placar completo!')
            return
        }

        const scoreANum = parseInt(scoreA)
        const scoreBNum = parseInt(scoreB)

        if (isNaN(scoreANum) || isNaN(scoreBNum)) {
            alert('Placar inválido!')
            return
        }

        const confirm = window.confirm(`Confirmar Placar: ${scoreANum} x ${scoreBNum}?`)
        if (!confirm) return

        try {
            console.log('Finalizando partida:', matchId, scoreANum, scoreBNum)

            // Update Match Status - trigger will handle bet resolution
            const { error } = await supabase
                .from('matches')
                .update({
                    status: 'finished',
                    score_a: scoreANum,
                    score_b: scoreBNum,
                    possession_home: parseInt(possessionA) || 50,
                    possession_away: parseInt(possessionB) || 50,
                    possession_winner: (parseInt(possessionA) || 50) > (parseInt(possessionB) || 50) ? 'home' : (parseInt(possessionB) || 50) > (parseInt(possessionA) || 50) ? 'away' : 'equal'
                })
                .eq('id', matchId)

            if (error) {
                console.error('Supabase update error:', error)
                throw error
            }

            alert('Partida Finalizada com Sucesso!')
            setFinishingMatchId(null)
            setScoreA('')
            setScoreB('')
            setPossessionA('')
            setPossessionB('')
        } catch (error: any) {
            console.error('Erro ao finalizar:', error)
            alert('Erro ao finalizar: ' + (error.message || JSON.stringify(error)))
        }
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-emerald-400 flex items-center gap-2">
                    <Trophy className="h-8 w-8" />
                    Painel do Admin
                </h1>
                <p className="text-gray-400">Gerenciar Partidas e Resultados</p>
            </header>

            <div className="grid gap-6 lg:grid-cols-3">

                {/* Left Column: Actions */}
                <div className="lg:col-span-1 space-y-6">
                    {/* Create Match */}
                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <PlayCircle className="h-5 w-5 text-emerald-500" />
                            Nova Partida
                        </h2>

                        <form onSubmit={handleCreateMatch} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Casa</label>
                                    <select
                                        className="w-full h-11 bg-gray-950 border border-gray-800 rounded-lg px-3 text-sm text-white outline-none focus:border-emerald-500"
                                        value={playerA}
                                        onChange={e => setPlayerA(e.target.value)}
                                        required
                                    >
                                        <option value="">Selecione...</option>
                                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Visitante</label>
                                    <select
                                        className="w-full h-11 bg-gray-950 border border-gray-800 rounded-lg px-3 text-sm text-white outline-none focus:border-emerald-500"
                                        value={playerB}
                                        onChange={e => setPlayerB(e.target.value)}
                                        required
                                    >
                                        <option value="">Selecione...</option>
                                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                                {loading ? 'Criando...' : 'Criar Partida Agora'}
                            </Button>
                        </form>
                    </section>

                    {/* Add Player */}
                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Users className="h-5 w-5 text-blue-400" />
                            Novo Jogador
                        </h2>
                        <form onSubmit={handleAddPlayer} className="space-y-3">
                            <Input
                                placeholder="Nome do Jogador"
                                value={newPlayerName}
                                onChange={e => setNewPlayerName(e.target.value)}
                                required
                            />
                            <div className="flex gap-2">
                                <select
                                    className="h-10 bg-gray-950 border border-gray-800 rounded-lg px-3 text-sm text-white outline-none focus:border-emerald-500 w-full"
                                    value={newPlayerCategory}
                                    onChange={e => setNewPlayerCategory(e.target.value)}
                                    required
                                >
                                    <option value="home">Casa</option>
                                    <option value="away">Visitante</option>
                                </select>
                                <Button type="submit" variant="secondary" disabled={addingPlayer} className="w-24">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </form>
                    </section>
                </div>

                {/* Right Column: Active Matches & History */}
                <div className="lg:col-span-2 space-y-8">

                    {/* Active Matches */}
                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Timer className="h-5 w-5 text-amber-500" />
                            Partidas Ativas ({activeMatches.length})
                        </h2>

                        {activeMatches.length === 0 ? (
                            <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-xl text-gray-500">
                                Nenhuma partida acontecendo agora.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activeMatches.map(match => (
                                    <div key={match.id} className="bg-gray-950 border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 flex-1">
                                            <div className="bg-gray-800 px-3 py-1 rounded text-xs font-bold text-gray-300">
                                                {match.game_type}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-white">{match.player_a.name}</span>
                                                <span className="text-gray-500 text-sm">vs</span>
                                                <span className="text-lg font-bold text-white">{match.player_b.name}</span>
                                            </div>
                                        </div>

                                        {finishingMatchId === match.id ? (
                                            <div className="flex flex-col gap-2 animate-in fade-in zoom-in-50 bg-gray-900 p-3 rounded-lg border border-gray-700">
                                                <div className="flex items-center gap-2 justify-between">
                                                    <span className="text-xs text-gray-400">Placar:</span>
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            className="w-14 h-8 text-center bg-gray-950"
                                                            placeholder="0"
                                                            value={scoreA}
                                                            onChange={e => setScoreA(e.target.value)}
                                                        />
                                                        <span className="text-gray-500">x</span>
                                                        <Input
                                                            type="number"
                                                            className="w-14 h-8 text-center bg-gray-950"
                                                            placeholder="0"
                                                            value={scoreB}
                                                            onChange={e => setScoreB(e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 justify-between">
                                                    <span className="text-xs text-gray-400">Posse %:</span>
                                                    <div className="flex items-center gap-1">
                                                        <Input
                                                            type="number"
                                                            className="w-14 h-8 text-center bg-gray-950"
                                                            placeholder="%"
                                                            value={possessionA}
                                                            onChange={e => {
                                                                const val = e.target.value
                                                                setPossessionA(val)
                                                                // Auto-calc other side
                                                                if (val && !isNaN(parseInt(val)) && parseInt(val) <= 100) {
                                                                    setPossessionB((100 - parseInt(val)).toString())
                                                                }
                                                            }}
                                                        />
                                                        <span className="text-gray-500">x</span>
                                                        <Input
                                                            type="number"
                                                            className="w-14 h-8 text-center bg-gray-950"
                                                            placeholder="%"
                                                            value={possessionB}
                                                            onChange={e => setPossessionB(e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 mt-1">
                                                    <Button
                                                        size="sm"
                                                        className="flex-1 bg-green-600 hover:bg-green-700 h-8 text-xs"
                                                        onClick={() => handleFinishMatch(match.id)}
                                                    >
                                                        Salvar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 text-xs px-2"
                                                        onClick={() => {
                                                            setFinishingMatchId(null)
                                                            setScoreA('')
                                                            setScoreB('')
                                                            setPossessionA('')
                                                            setPossessionB('')
                                                        }}
                                                    >
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400"
                                                onClick={() => {
                                                    setFinishingMatchId(match.id)
                                                    setScoreA('0')
                                                    setScoreB('0')
                                                    setPossessionA('50')
                                                    setPossessionB('50')
                                                }}
                                            >
                                                Informar Placar
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Match History */}
                    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-gray-400" />
                            Histórico ({finishedMatches.length})
                        </h2>

                        <div className="space-y-4">
                            {finishedMatches.map(match => (
                                <div key={match.id} className="bg-gray-950/50 border border-gray-800 rounded-xl p-4 flex items-center justify-between opacity-75">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-gray-800 px-3 py-1 rounded text-xs font-bold text-gray-500">
                                            {match.game_type}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-white font-medium">{match.player_a.name}</span>
                                            <span className="bg-gray-800 px-2 py-1 rounded text-white font-bold">{match.score_a}</span>
                                            <span className="text-gray-600 text-xs">vs</span>
                                            <span className="bg-gray-800 px-2 py-1 rounded text-white font-bold">{match.score_b}</span>
                                            <span className="text-white font-medium">{match.player_b.name}</span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-green-500 font-bold border border-green-900 bg-green-900/10 px-2 py-1 rounded">
                                        FINALIZADO
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

            </div>
        </div>
    )
}
