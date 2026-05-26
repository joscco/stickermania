import type {StickerCollageVoteResult} from '../index.js';

export function buildResults(scored: Array<{playerId: string; score: number; collageId: string}>): {
  results: StickerCollageVoteResult[];
  winnerId: string | null;
  tiedWinnerIds: string[];
} {
  if (scored.length === 0) return {results: [], winnerId: null, tiedWinnerIds: []};

  const results: StickerCollageVoteResult[] = [];
  let placement = 1;
  for (let i = 0; i < scored.length; i++) {
    if (i > 0 && scored[i].score !== scored[i - 1].score) placement = i + 1;
    results.push({collageId: scored[i].collageId, playerId: scored[i].playerId, voteCount: 0, placement});
  }

  const bestScore = scored[0].score;
  const topPlayers = scored.filter(s => s.score === bestScore);
  const winnerId = topPlayers[Math.floor(Math.random() * topPlayers.length)]?.playerId ?? null;
  const tiedWinnerIds = topPlayers.filter(s => s.playerId !== winnerId).map(s => s.playerId);

  return {results, winnerId, tiedWinnerIds};
}
