import type {ThesisTask, ThesisSubmission, StickerCollage, MinigameClientAction} from '../../index.js';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<ThesisTask, ThesisSubmission> = {
  type: 'thesis',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'thesis', title, durationSec,
      optionA: typeof raw['optionA'] === 'string' ? raw['optionA'] : undefined,
      optionB: typeof raw['optionB'] === 'string' ? raw['optionB'] : undefined,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-thesis') return null;
    return {
      type: 'thesis',
      playerId,
      roundIndex,
      agreed: action.agreed,
      estimatedPercent: action.estimatedPercent,
      submittedAt: now,
    };
  },

  getSnapshotSvg(submission) {
    const agreed = submission.agreed ? '✓ Zustimmung' : '✗ Ablehnung';
    const pct = `${submission.estimatedPercent}%`;
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#f5f5f5"/><text x="100" y="35" text-anchor="middle" font-size="14" font-family="sans-serif" fill="black">${agreed}</text><text x="100" y="55" text-anchor="middle" font-size="12" font-family="sans-serif" fill="#666">Schätzung: ${pct}</text></svg>`
    )}`;
  },

  requiresVoting: () => false,

  evaluateSubmissions(submissions, collages) {
    const collageMap = new Map(collages.map(c => [c.playerId, c]));
    const total = submissions.length;
    const agreedCount = submissions.filter(s => s.agreed).length;
    const actualPercent = total > 0 ? (agreedCount / total) * 100 : 50;

    const scored = submissions.map(s => ({
      playerId: s.playerId,
      score: Math.abs(s.estimatedPercent - actualPercent),
      collageId: collageMap.get(s.playerId)?.id ?? '',
    }));
    scored.sort((a, b) => a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission, allSubmissions) {
    if (!mySubmission) return 'Keine Teilnahme';
    const total = allSubmissions.length;
    const agreedCount = allSubmissions.filter(s => s.agreed).length;
    const actualPct = total > 0 ? Math.round((agreedCount / total) * 100) : 50;
    return `Du hast ${mySubmission.agreed ? "zugestimmt" : "abgelehnt"} und ${mySubmission.estimatedPercent}% geschätzt. Tatsächlich: ${actualPct}%. Abweichung: ${Math.abs(mySubmission.estimatedPercent - actualPct)}%`;
  },

  getDescription() {
    return 'Stimme der These zu oder lehne sie ab. Schätze dann, wie viel Prozent der Spieler genauso abgestimmt haben.';
  },
};

minigameRegistry.register(handler);
export {handler};
