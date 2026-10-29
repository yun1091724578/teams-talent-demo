/** Demo sources only. These definitions do not connect to external platforms. */
import { currentT, type MessageKey } from '../../shared/i18n/index.js';

// Names, data types and descriptions are product copy: the ids stay stable and the text follows the UI language.
const text: Record<string, { name: MessageKey; dataTypes: MessageKey[]; description: MessageKey }> = {
  repository: { name: 'plat.repository.name', dataTypes: ['plat.repository.dataType'], description: 'plat.repository.desc' },
  requirements: { name: 'plat.requirements.name', dataTypes: ['plat.requirements.dataType'], description: 'plat.requirements.desc' },
  defects: { name: 'plat.defects.name', dataTypes: ['plat.defects.dataType1', 'plat.defects.dataType2'], description: 'plat.defects.desc' },
  'design-library': { name: 'plat.designLibrary.name', dataTypes: ['plat.designLibrary.dataType1', 'plat.designLibrary.dataType2'], description: 'plat.designLibrary.desc' },
  'test-assets': { name: 'plat.testAssets.name', dataTypes: ['plat.testAssets.dataType'], description: 'plat.testAssets.desc' },
};
const ids = ['repository', 'requirements', 'defects', 'design-library', 'test-assets'] as const;
type PlatformId = typeof ids[number];

export const externalPlatforms = ids.map(id => Object.defineProperties({ id } as { id: PlatformId; name: string; dataTypes: string[]; description: string }, {
  name: { get: () => currentT(text[id].name), enumerable: true },
  dataTypes: { get: () => text[id].dataTypes.map(key => currentT(key)), enumerable: true },
  description: { get: () => currentT(text[id].description), enumerable: true },
}));

export function externalPlatformDefault(id: string) {
  const source = externalPlatforms.find(item => item.id === id);
  return source ? { id: source.id, name: source.name, kind: 'asset', enabled: true, description: source.description } : undefined;
}
