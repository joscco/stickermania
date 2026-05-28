import type {ShapeSplitTask, ShapeSplitSubmission, RoundSubmission, MinigameClientAction} from '../../contract';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<ShapeSplitTask, ShapeSplitSubmission> = {
  type: 'shape-split',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'shape-split', title, durationSec,
      backgroundSvg: typeof raw['backgroundSvg'] === 'string' ? raw['backgroundSvg'] : undefined,
      polygon: Array.isArray(raw['polygon'])
        ? (raw['polygon'] as unknown[]).filter((p: any) => typeof p?.x === 'number' && typeof p?.y === 'number').map((p: any) => ({x: p.x, y: p.y}))
        : [{x: 20, y: 20}, {x: 180, y: 20}, {x: 180, y: 180}, {x: 20, y: 180}],
      targetFraction: typeof raw['targetFraction'] === 'number' ? Math.max(0, Math.min(1, raw['targetFraction'])) : 0.5,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-shape-split') return null;
    return {
      type: 'shape-split',
      playerId,
      roundIndex,
      cutLine: action.cutLine,
      areaFraction: action.areaFraction,
      submittedAt: now,
    };
  },

  getSnapshotSvg(submission) {
    const {cutLine, areaFraction} = submission;
    const pct = Math.round(areaFraction * 100);
    return `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#f5f5f5"/><line x1="${cutLine.a.x}" y1="${cutLine.a.y}" x2="${cutLine.b.x}" y2="${cutLine.b.y}" stroke="black" stroke-width="2"/><text x="100" y="110" text-anchor="middle" font-size="20" font-family="sans-serif">${pct}%</text></svg>`
    )}`;
  },

  requiresVoting: () => false,

  evaluateSubmissions(submissions, roundSubmissions, task) {
    const submissionMap = new Map(roundSubmissions.map(c => [c.playerId, c]));
    const target = task.targetFraction;

    const scored = submissions.map(s => ({
      playerId: s.playerId,
      score: Math.abs(s.areaFraction - target),
      submissionId: submissionMap.get(s.playerId)?.id ?? '',
    }));
    scored.sort((a, b) => a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission, _allSubmissions, task) {
    if (!mySubmission) return 'Keine Teilnahme';
    const target = task.targetFraction;
    const myPct = Math.round(mySubmission.areaFraction * 100);
    const targetPct = Math.round(target * 100);
    return `Du hast ${myPct}:${100 - myPct} geteilt. Ziel: ${targetPct}:${100 - targetPct}. Abweichung: ${Math.abs(mySubmission.areaFraction - target).toFixed(2)}`;
  },

  getDescription(task) {
    const pct = Math.round(task.targetFraction * 100);
    return `Ziehe eine Linie, um die Form im Verhältnis ${pct}:${100 - pct} zu teilen. Wer am genauesten teilt, gewinnt.`;
  },
};

minigameRegistry.register(handler);
export {handler};
