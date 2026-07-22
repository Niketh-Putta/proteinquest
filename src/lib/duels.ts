import { supabase } from '@/lib/supabase';
import type { ProteinDuel } from '@/lib/types';

function endDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function fetchActiveDuels(): Promise<ProteinDuel[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('protein_duels')
    .select('*')
    .eq('status', 'active')
    .or(`challenger_id.eq.${uid},opponent_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProteinDuel[];
}

/** Start a 7-day protein duel with a friend (by profile id). */
export async function createDuel(opponentId: string): Promise<ProteinDuel> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error('Sign in required');
  if (uid === opponentId) throw new Error('Pick a different trainer');

  const { data, error } = await supabase
    .from('protein_duels')
    .insert({
      challenger_id: uid,
      opponent_id: opponentId,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: endDatePlusDays(7),
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProteinDuel;
}

/** Refresh duel protein totals via security-definer RPC. */
export async function refreshDuelTotals(duelId: string): Promise<ProteinDuel> {
  const { data, error } = await supabase.rpc('refresh_protein_duel', {
    p_duel_id: duelId,
  });
  if (error) throw error;
  return data as ProteinDuel;
}

export function duelDaysLeft(endDate: string): number {
  const end = new Date(`${endDate}T23:59:59`);
  const ms = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function duelShareMessage(params: {
  myName: string;
  myProtein: number;
  theirProtein: number;
  daysLeft: number;
  inviteUrl?: string | null;
}): string {
  const lead =
    params.myProtein === params.theirProtein
      ? 'tied'
      : params.myProtein > params.theirProtein
        ? 'winning'
        : 'trailing';
  const link = params.inviteUrl ? `\nJoin me: ${params.inviteUrl}` : '';
  return (
    `${params.myName} is ${lead} a ProteinQuest duel ` +
    `(${Math.round(params.myProtein)}g vs ${Math.round(params.theirProtein)}g, ` +
    `${params.daysLeft}d left). Scan meals. Feed your dragon.${link}`
  );
}

/** Lightweight share card copy for Stories / messages. */
export function dragonShareCardMessage(params: {
  dragonName: string;
  proteinToday: number;
  goal: number;
  inviteUrl?: string | null;
}): string {
  const pct =
    params.goal > 0 ? Math.min(100, Math.round((params.proteinToday / params.goal) * 100)) : 0;
  const link = params.inviteUrl ? `\n${params.inviteUrl}` : '';
  return (
    `${params.dragonName} ate ${Math.round(params.proteinToday)}g protein today` +
    (params.goal > 0 ? ` (${pct}% of goal).` : '.') +
    ` Track with me on ProteinQuest.${link}`
  );
}
