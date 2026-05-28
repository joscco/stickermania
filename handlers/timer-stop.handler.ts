import type {TimerStopTask, TimerStopSubmission, RoundSubmission, MinigameClientAction} from '../../contract';
import type {MinigameHandler} from '../types.js';
import {minigameRegistry} from '../registry.js';
import {buildResults} from '../utils.js';

const handler: MinigameHandler<TimerStopTask, TimerStopSubmission> = {
  type: 'timer-stop',

  parseTask(raw, id, title, durationSec) {
    return {
      id, type: 'timer-stop', title, durationSec,
      targetSec: typeof raw['targetSec'] === 'number' ? raw['targetSec'] : 5,
    };
  },

  createSubmission(playerId, roundIndex, action, now) {
    if (action.type !== 'submit-timer') return null;
    return {
      type: 'timer-stop',
      playerId,
      roundIndex,
      elapsedSec: action.elapsedSec,
      submittedAt: now,
    };
  },

  getSnapshotSvg: () => null,

  requiresVoting: () => false,

  evaluateSubmissions(submissions, roundSubmissions, task) {
    const submissionMap = new Map(roundSubmissions.map(c => [c.playerId, c]));
    const target = task.targetSec;

    const scored = submissions.map(s => ({
      playerId: s.playerId,
      score: Math.abs(s.elapsedSec - target),
      submissionId: submissionMap.get(s.playerId)?.id ?? '',
    }));
    scored.sort((a, b) => a.score - b.score);

    return buildResults(scored);
  },

  getResultSummary(mySubmission, _allSubmissions, task) {
    if (!mySubmission) return 'Keine Teilnahme';
    const target = task.targetSec;
    return `Du hast bei ${mySubmission.elapsedSec.toFixed(2)}s gestoppt. Ziel: ${target}s. Abweichung: ${Math.abs(mySubmission.elapsedSec - target).toFixed(2)}s`;
  },

  getDescription(task) {
    return `Stoppe die Uhr so nah wie möglich an ${task.targetSec} Sekunden. Wer am nächsten dran ist, gewinnt.`;
  },
};

minigameRegistry.register(handler);
export {handler};
