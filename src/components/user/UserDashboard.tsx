import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Coins, Trophy, Calendar, Clock, CheckCircle } from 'lucide-react'

interface Match {
    id: string
    player_a: { name: string }
    player_b: { name: string }
    game_type: string
    scheduled_at: string
    status: string
    score_a?: number
    score_b?: number
    odds: Odd[]
}

interface Odd {
    id: string
    market_type: string
    selection: string
    value: number
}

// Helper to translate selection names
const getSelectionName = (selection: string, match: Match) => {
    if (selection === 'home') return match.player_a.name
    if (selection === 'away') return match.player_b.name
    if (selection === 'draw') return 'Empate'
    if (selection === 'equal') return 'Empate (Posse)'
    return selection // For exact score or others
}

const getMarketName = (market: string) => {
    if (market === 'match_winner') return 'Vencedor'
    if (market === 'possession') return 'Posse de Bola'
    if (market === 'exact_score') return 'Placar Exato'
    return market
}

export function UserDashboard({ userId }: { userId: string }) {
    const [matches, setMatches] = useState<Match[]>([])
    const [balance, setBalance] = useState(0)
    const [loading, setLoading] = useState(false)

    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
    const [selectedOdds, setSelectedOdds] = useState<Odd[]>([])
    const [betAmount, setBetAmount] = useState('')

    useEffect(() => {
        fetchData()

        const subscription = supabase
            .channel('user-dashboard')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, fetchBalance)
            .subscribe()

        return () => { subscription.unsubscribe() }
    }, [userId])

    async function fetchData() {
        try {
            await Promise.all([
                fetchBalance(),
                fetchMatches()
            ])
        } catch (error) {
            console.error('Error fetching data:', error)
        }
    }

    async function fetchBalance() {
        const { data } = await supabase.from('profiles').select('balance').eq('id', userId).single()
        if (data) setBalance(data.balance)
    }

    async function fetchMatches() {
        const { data } = await supabase
            .from('matches')
            .select(`
        id, 
        game_type, 
        scheduled_at, 
        player_a:players!matches_player_a_id_fkey(name),
        player_b:players!matches_player_b_id_fkey(name),
        odds(id, market_type, selection, value)
      `)
            .eq('status', 'open')
            .order('scheduled_at', { ascending: true })

        if (data) {
            // Split matches into active and finished logic if needed, 
            // but here we might want to query finished matches separately or filter.
            // Let's modify the query to get ALL relevant matches 
            // OR perform two queries. For simplicity and performance, let's keep this for OPEN matches 
            // and add a separate query/state for FINISHED matches.

            setMatches(data as any)
        }
    }

    const toggleSelection = (odd: Odd, matchId: string) => {
        if (selectedMatchId && selectedMatchId !== matchId) {
            if (!window.confirm('Você só pode apostar em uma partida por vez. Deseja limpar a seleção atual e começar esta?')) {
                return
            }
            setSelectedMatchId(matchId)
            setSelectedOdds([odd])
            return
        }

        setSelectedMatchId(matchId)

        // Check if already selected
        if (selectedOdds.some(o => o.id === odd.id)) {
            // Deselect
            const newSelection = selectedOdds.filter(o => o.id !== odd.id)
            setSelectedOdds(newSelection)
            if (newSelection.length === 0) setSelectedMatchId(null)
        } else {
            // Limit 1 selection per market type to avoid logical paradoxes
            const hasMarket = selectedOdds.some(o => o.market_type === odd.market_type)
            if (hasMarket) {
                const newSelection = selectedOdds.filter(o => o.market_type !== odd.market_type)
                setSelectedOdds([...newSelection, odd])
            } else {
                setSelectedOdds([...selectedOdds, odd])
            }
        }
    }

    const totalMultiplier = selectedOdds.reduce((acc, odd) => acc * odd.value, 1)

    async function handlePlaceBet(e: React.FormEvent) {
        e.preventDefault()
        if (selectedOdds.length === 0 || !selectedMatchId) return

        const amount = parseFloat(betAmount)
        if (isNaN(amount) || amount <= 0) {
            alert('Valor inválido')
            return
        }
        if (amount > balance) {
            alert('Saldo insuficiente!')
            return
        }

        setLoading(true)
        try {
            const selectionsPayload = selectedOdds.map(odd => ({ odd_id: odd.id }))

            // Call RPC
            const { data, error } = await supabase.rpc('place_bet', {
                p_user_id: userId,
                p_match_id: selectedMatchId,
                p_amount: amount,
                p_total_odds: totalMultiplier,
                p_selections: selectionsPayload
            })

            if (error) throw error

            if (data && !data.success) {
                throw new Error(data.message)
            }

            alert(`Aposta confirmada! \nRetorno Potencial: R$ ${(amount * totalMultiplier).toFixed(2)}`)

            setBetAmount('')
            setSelectedOdds([])
            setSelectedMatchId(null)
            fetchBalance()

        } catch (error: any) {
            alert('Erro ao apostar: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto pb-24">
            {/* Helper Header */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 flex items-center justify-between">
                <div>
                    <h3 className="text-gray-400 text-sm font-medium uppercase mb-1">Seu Saldo</h3>
                    <div className="text-4xl font-bold text-white flex items-center gap-2">
                        <span className="text-emerald-500">R$</span>
                        {balance.toFixed(2)}
                    </div>
                </div>
                <Coins className="h-12 w-12 text-emerald-500/20" />
            </div>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-400" />
                Jogos Abertos
            </h2>

            {/* Matches List */}
            {matches.length === 0 ? (
                <div className="text-center py-12 bg-gray-900/50 rounded-xl border border-dashed border-gray-800">
                    <p className="text-gray-400">Nenhuma partida disponível para apostar no momento.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {matches.map(match => (
                        <div key={match.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors">
                            {/* Match Header */}
                            <div className="bg-gray-950 p-4 flex items-center justify-between border-b border-gray-800">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <span className="bg-gray-800 text-white px-2 py-0.5 rounded text-xs font-bold">{match.game_type}</span>
                                    <Calendar className="h-3 w-3" />
                                    {new Date(match.scheduled_at).toLocaleDateString('pt-BR')}
                                    <Clock className="h-3 w-3 ml-2" />
                                    {new Date(match.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>

                            {/* Match Body */}
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="text-center flex-1">
                                        <div className="text-xl font-bold text-white mb-1">{match.player_a.name}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-widest">Casa</div>
                                    </div>
                                    <div className="text-2xl font-bold text-gray-600 px-4">VS</div>
                                    <div className="text-center flex-1">
                                        <div className="text-xl font-bold text-white mb-1">{match.player_b.name}</div>
                                        <div className="text-xs text-gray-500 uppercase tracking-widest">Visitante</div>
                                    </div>
                                </div>

                                {/* Markets Section */}
                                <div className="space-y-6">
                                    {/* Winner Market */}
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Vencedor da Partida</h4>
                                        <div className="grid grid-cols-3 gap-2">
                                            {match.odds.filter(o => o.market_type === 'match_winner').sort((a, b) => a.value - b.value).map(odd => (
                                                <OddButton
                                                    key={odd.id}
                                                    odd={odd}
                                                    match={match}
                                                    isSelected={selectedOdds.some(o => o.id === odd.id)}
                                                    onClick={() => toggleSelection(odd, match.id)}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Possession Market */}
                                    {match.odds.some(o => o.market_type === 'possession') && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Quem terá mais Posse de Bola?</h4>
                                            <div className="grid grid-cols-3 gap-2">
                                                {match.odds.filter(o => o.market_type === 'possession').map(odd => (
                                                    <OddButton
                                                        key={odd.id}
                                                        odd={odd}
                                                        match={match}
                                                        isSelected={selectedOdds.some(o => o.id === odd.id)}
                                                        onClick={() => toggleSelection(odd, match.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Exact Score Market */}
                                    {match.odds.some(o => o.market_type === 'exact_score') && (
                                        <div>
                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Placar Exato</h4>
                                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                                {match.odds.filter(o => o.market_type === 'exact_score').map(odd => (
                                                    <OddButton
                                                        key={odd.id}
                                                        odd={odd}
                                                        match={match}
                                                        isSelected={selectedOdds.some(o => o.id === odd.id)}
                                                        onClick={() => toggleSelection(odd, match.id)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <MyBetsHistory userId={userId} />

            {/* Betting Slip (Bottom Bar) */}
            {selectedOdds.length > 0 && selectedMatchId && (
                <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-emerald-500/30 p-4 shadow-2xl animate-in slide-in-from-bottom-4 z-50">
                    <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center gap-4">
                        <div className="flex-1 w-full">
                            <div className="flex justify-between text-sm mb-2">
                                <span className="text-emerald-400 font-bold">{selectedOdds.length} Seleções</span>
                                <span className="text-white font-bold text-lg">Odds Total: {totalMultiplier.toFixed(2)}x</span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-2">
                                {selectedOdds.map(odd => (
                                    <span key={odd.id} className="inline-flex items-center text-xs bg-gray-800 border border-gray-700 rounded px-2 py-1 whitespace-nowrap">
                                        <span className="text-gray-400 mr-1">{getMarketName(odd.market_type)}:</span>
                                        <span className="text-white font-bold">{getSelectionName(odd.selection, matches.find(m => m.id === selectedMatchId)!)}</span>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <form onSubmit={handlePlaceBet} className="flex gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-40">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">R$</span>
                                <Input
                                    type="number"
                                    className="pl-10 h-12 bg-gray-950 border-gray-700 text-lg font-bold"
                                    placeholder="Valor"
                                    value={betAmount}
                                    onChange={e => setBetAmount(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <Button type="submit" className="h-12 px-8 bg-emerald-600 hover:bg-emerald-700 text-lg font-bold shadow-[0_0_20px_rgba(5,150,105,0.3)]" disabled={loading}>
                                {loading ? '...' : `Apostar R$ ${betAmount ? (parseFloat(betAmount) * totalMultiplier).toFixed(2) : '0.00'}`}
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function OddButton({ odd, match, isSelected, onClick }: { odd: Odd, match: Match, isSelected: boolean, onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`
                flex flex-col items-start justify-center p-3 rounded-lg border transition-all text-left relative overflow-hidden
                ${isSelected
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-[0_0_15px_rgba(5,150,105,0.4)]'
                    : 'bg-gray-950 text-gray-300 border-gray-800 hover:border-gray-600 hover:bg-gray-900'}
            `}
        >
            <span className="text-xs font-medium opacity-80 mb-0.5 line-clamp-1 w-full">
                {getSelectionName(odd.selection, match)}
            </span>
            <span className="text-lg font-bold tracking-tight">{odd.value.toFixed(2)}</span>

            {isSelected && (
                <div className="absolute top-2 right-2">
                    <CheckCircle className="h-4 w-4 text-white" />
                </div>
            )}
        </button>
    )
}

function MyBetsHistory({ userId }: { userId: string }) {
    const [bets, setBets] = useState<any[]>([])

    useEffect(() => {
        fetchBets()

        const sub = supabase
            .channel('my-bets')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bets', filter: `user_id=eq.${userId}` }, fetchBets)
            .subscribe()

        return () => { sub.unsubscribe() }
    }, [userId])

    async function fetchBets() {
        const { data } = await supabase
            .from('bets')
            .select(`
                *,
                match:matches(
                    player_a:players!matches_player_a_id_fkey(name),
                    player_b:players!matches_player_b_id_fkey(name),
                    score_a, score_b
                ),
                selections:bet_selections(
                    odd:odds(market_type, selection, value)
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20)

        if (data) setBets(data)
    }

    if (bets.length === 0) return null

    return (
        <div className="mt-12">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Trophy className="h-5 w-5 text-gray-500" />
                Minhas Apostas
            </h2>
            <div className="space-y-4">
                {bets.map(bet => (
                    <div key={bet.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <div className="text-sm font-bold text-white mb-1">
                                    {bet.match.player_a.name} x {bet.match.player_b.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {new Date(bet.created_at).toLocaleDateString()}
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-xs font-bold uppercase
                                ${bet.status === 'won' ? 'bg-green-500/20 text-green-400' :
                                    bet.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                                        'bg-yellow-500/20 text-yellow-400'}`}>
                                {bet.status === 'won' ? 'Ganhou' : bet.status === 'lost' ? 'Perdeu' : 'Pendente'}
                            </div>
                        </div>

                        <div className="bg-gray-950/50 rounded p-2 mb-3 space-y-1">
                            {bet.selections?.map((sel: any, i: number) => (
                                <div key={i} className="flex justify-between text-xs text-gray-300">
                                    <span>{getMarketName(sel.odd.market_type)}: {getSelectionName(sel.odd.selection, bet.match)}</span>
                                    <span className="font-bold text-emerald-500">{sel.odd.value.toFixed(2)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center text-sm border-t border-gray-800 pt-3">
                            <div>
                                <div className="text-xs text-gray-500">Valor Apostado</div>
                                <div className="font-bold text-white">R$ {bet.amount.toFixed(2)}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-500">Retorno {bet.status === 'won' ? 'Recebido' : 'Potencial'}</div>
                                <div className={`font-bold ${bet.status === 'won' ? 'text-green-400' : 'text-emerald-400'}`}>
                                    R$ {bet.potential_payout.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
