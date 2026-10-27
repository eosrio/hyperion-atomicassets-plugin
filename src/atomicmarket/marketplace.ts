import type {
  ProjectionQuery,
  ProjectionQueryResult,
  ProjectionReadView,
} from '@eosrio/hyperion-sdk/projection';

export interface Marketplace {
  readonly marketplace_name: string;
  readonly creator: string;
  readonly created_at_block: string;
  readonly created_at_time: string;
}

export interface MarketplaceReader<View extends ProjectionReadView> {
  query(view: View, query: ProjectionQuery): Promise<ProjectionQueryResult & {readonly view: View}>;
}

export interface MarketplaceRead<View extends ProjectionReadView> {
  readonly view: View;
  readonly data: Marketplace;
}

export class MarketplaceNotFoundError extends Error {
  readonly statusCode = 416;

  constructor() {
    super('Marketplace not found');
    this.name = 'MarketplaceNotFoundError';
  }
}

/** A domain read over an already opened SDK serving view; it grants no source/serving authority. */
export async function readMarketplace<View extends ProjectionReadView>(
  reader: MarketplaceReader<View>,
  view: View,
  marketContract: string,
  marketplaceName: string,
): Promise<MarketplaceRead<View>> {
  const result = await reader.query(view, {
    filter: [
      {field: 'market_contract', op: 'eq', value: marketContract},
      {field: 'marketplace_name', op: 'eq', value: marketplaceName},
    ],
    limit: 2,
  });
  if (result.rows.length === 0 && result.nextAfterKey === undefined) throw new MarketplaceNotFoundError();
  if (result.rows.length !== 1 || result.nextAfterKey !== undefined) {
    throw new Error('Marketplace projection lookup is not unique');
  }
  const record = result.rows[0]!.value;
  const field = (name: string): string => {
    const value = record[name];
    if (typeof value !== 'string') throw new Error(`Marketplace projection field ${name} must be a string`);
    return value;
  };
  return {
    view: result.view,
    data: {
      marketplace_name: field('marketplace_name'), creator: field('creator'),
      created_at_block: field('created_at_block'), created_at_time: field('created_at_time'),
    },
  };
}
