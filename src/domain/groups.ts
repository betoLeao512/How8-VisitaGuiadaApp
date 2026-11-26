/*
 * Formação dos grupos da atividade do Plenário (mesma regra da simulação 3).
 * Este arquivo não importa nada: o servidorzinho do PC (Node 24) também o usa diretamente.
 */
export type Side = 'Lia' | 'Caio';

export type VotingGroup = {
  /** Nome que a turma vê: L1, L2… (lado da Lia) e C1, C2… (lado do Caio). */
  id: string;
  side: Side;
  size: number;
};

export const MIN_ALUNOS = 4;
export const MAX_ALUNOS = 40;
const MAX_POR_GRUPO = 5;

/** Menor número de grupos de até 5 (mínimo 2), tamanhos equilibrados, os maiores primeiro. */
export function formGroups(studentCount: unknown): VotingGroup[] {
  if (typeof studentCount !== 'number') {
    throw new TypeError(`A quantidade de alunos deve ser um número de ${MIN_ALUNOS} a ${MAX_ALUNOS}.`);
  }
  if (!Number.isInteger(studentCount) || studentCount < MIN_ALUNOS || studentCount > MAX_ALUNOS) {
    throw new RangeError(`Informe uma quantidade inteira de alunos de ${MIN_ALUNOS} a ${MAX_ALUNOS}.`);
  }

  const groupCount = Math.max(2, Math.ceil(studentCount / MAX_POR_GRUPO));
  const baseSize = Math.floor(studentCount / groupCount);
  const extraStudents = studentCount % groupCount;

  return Array.from({ length: groupCount }, (_, index) => {
    const side: Side = index % 2 === 0 ? 'Lia' : 'Caio';
    return {
      id: `${side === 'Lia' ? 'L' : 'C'}${Math.floor(index / 2) + 1}`,
      side,
      size: baseSize + (index < extraStudents ? 1 : 0),
    };
  });
}
