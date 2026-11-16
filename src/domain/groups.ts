export type DossierId = 'PEDESTRES' | 'VEICULOS' | 'LEGISLACAO' | 'FISCALIZACAO';

export type InvestigationGroup = {
  id: string;
  size: number;
  dossierIds: DossierId[];
};

const DOSSIER_IDS: readonly DossierId[] = [
  'PEDESTRES', 'VEICULOS', 'LEGISLACAO', 'FISCALIZACAO',
];

/** Forms independent, balanced groups; accepts no coercion of external input. */
export function formGroups(studentCount: unknown): InvestigationGroup[] {
  if (typeof studentCount !== 'number') {
    throw new TypeError('A quantidade de estudantes deve ser um número entre 9 e 31.');
  }
  if (!Number.isInteger(studentCount) || studentCount < 9 || studentCount > 31) {
    throw new RangeError('Informe uma quantidade inteira de estudantes entre 9 e 31.');
  }

  const groupCount = Math.ceil(studentCount / 5);
  const baseSize = Math.floor(studentCount / groupCount);
  const extraStudents = studentCount % groupCount;
  const groups: InvestigationGroup[] = Array.from({ length: groupCount }, (_, index) => ({
    id: String.fromCharCode(65 + index),
    size: baseSize + (index < extraStudents ? 1 : 0),
    dossierIds: [],
  }));

  // Cover all four dossiers for small classes; repeat them circularly for larger ones.
  for (let index = 0; index < Math.max(groupCount, DOSSIER_IDS.length); index++) {
    groups[index % groupCount].dossierIds.push(DOSSIER_IDS[index % DOSSIER_IDS.length]);
  }

  return groups;
}
