import type { Asset } from './workspace.js';

/** Exact existing references are projected without migrating saved state. */
export function legacyAssetSourceIds(asset: Asset): string[] {
  if (asset.sourceAssetId) return [asset.sourceAssetId];
  if (asset.id === 'code' && asset.location === 'https://github.com/JeffyLiu003/carddemo-java-1025.git') return ['repository:carddemo:carddemo-java-1025'];
  if (asset.id === 'design' && asset.location === 'docs/design/08-marketing-capability.md') return ['design-library:carddemo:marketing-capability'];
  if (asset.id === 'adr' && asset.location === 'ADR-009 / ADR-007') return ['design-library:carddemo:ADR-009', 'design-library:carddemo:ADR-007'];
  return [];
}

export function validateProjectAssets(value: unknown): asserts value is Asset[] {
  if (!Array.isArray(value) || value.length > 50 || value.some(asset => !asset || typeof asset !== 'object' || ['id', 'title', 'kind', 'location'].some(key => typeof asset[key] !== 'string' || !asset[key]) || (Object.hasOwn(asset, 'sourceAssetId') && typeof asset.sourceAssetId !== 'string')) || new Set(value.map(asset => asset.id)).size !== value.length) throw new Error('项目资产引用损坏；未自动覆盖');
}
