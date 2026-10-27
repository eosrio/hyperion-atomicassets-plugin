import {ProjectionContractError, validateContextualProjectionDefinition,
  type ContextualProjectionDefinition} from '@eosrio/hyperion-sdk/projection';

export interface MarketplaceDefinitionOptions {
  readonly id: string;
  readonly mappingRevision: string;
  readonly marketContract: string;
  readonly abiDeployment: string;
  readonly abiSha256: string;
}

/** Inert genesis-only mapping. The host still proves original source, ABI, completeness and serving authority. */
export function createMarketplaceDefinition(options: MarketplaceDefinitionOptions): ContextualProjectionDefinition {
  if (options === null || typeof options !== 'object' || Object.getOwnPropertySymbols(options).length !== 0)
    throw new ProjectionContractError('projection.invalid-contract', 'Invalid marketplace definition options');
  const fields = Object.getOwnPropertyDescriptors(options);
  if (Object.keys(fields).sort().join(',') !== 'abiDeployment,abiSha256,id,mappingRevision,marketContract'
    || Object.values(fields).some(field => !('value' in field) || !field.enumerable))
    throw new ProjectionContractError('projection.invalid-contract', 'Marketplace definition options must be closed data');
  const selected = validateContextualProjectionDefinition({schemaVersion: 2,
    id: fields.id!.value, mappingRevision: fields.mappingRevision!.value,
    source: {contract: fields.marketContract!.value, table: 'marketplaces',
      abiDeployment: fields.abiDeployment!.value, abiSha256: fields.abiSha256!.value},
    fields: [
      {name: 'market_contract', type: 'string', source: {kind: 'context', field: 'contract'}},
      {name: 'marketplace_name', type: 'string', source: {kind: 'row', path: ['marketplace_name']}},
      {name: 'creator', type: 'string', source: {kind: 'row', path: ['creator']}},
      {name: 'created_at_block', type: 'string', source: {kind: 'context', field: 'blockNum', format: 'decimal'}},
      {name: 'created_at_time', type: 'string', source: {kind: 'context', field: 'blockTimeMs', format: 'decimal'}},
    ], initialization: {kind: 'genesis'}, preserveOnReplace: ['created_at_block', 'created_at_time'], onAbsent: 'incomplete'});
  if (!selected.valid) throw new ProjectionContractError('projection.invalid-contract', selected.errors[0]!.message);
  return selected.value;
}
