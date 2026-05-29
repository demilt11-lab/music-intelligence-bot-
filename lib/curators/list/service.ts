/**
 * Curator list – service layer.
 * @module lib/curators/list/service
 */

import type { CuratorListParams, CuratorListResponse } from './types';
import { queryCurators } from './query';
import { normalizeCuratorRow } from './normalize';

/**
 * Fetches a paginated, filtered list of curators for a given platform.
 *
 * Delegates raw data retrieval to {@link queryCurators} and transforms each
 * row into a typed {@link CuratorRow} via {@link normalizeCuratorRow}.
 *
 * @param params - Validated curator list parameters.
 * @returns A {@link CuratorListResponse} containing the current page and total count.
 */
export async function getCuratorList(
  params: CuratorListParams,
): Promise<CuratorListResponse> {
  const { data, total } = await queryCurators(params);

  const obj = data.map((row, index) =>
    normalizeCuratorRow(row, params.offset + index + 1, params.platform),
  );

  return {
    obj,
    offset: params.offset,
    total,
  };
}
