export type AnswerResult = 'correct' | 'incorrect' | 'timeout';

export function calculateScore(result: AnswerResult): number {
  return result === 'correct' ? 100 : 0;
}
