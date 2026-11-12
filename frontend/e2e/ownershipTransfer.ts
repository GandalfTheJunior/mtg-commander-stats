import type { Route } from '@playwright/test'

const transferRead = /^\/api\/groups\/[^/]+\/ownership-transfer(\/notices)?$/

/**
 * Backend-equivalent replies for the ownership-transfer reads issued on group routes
 * (docs/product/groups-api.md): no visible pending transfer (404 problem) and no unacknowledged
 * outcome notices (empty array). Group fixtures call this before their own catch-all so these
 * reads never receive an accidental, invalid response. Returns whether the route was fulfilled.
 */
export async function fulfillNoOwnershipTransfer(route: Route): Promise<boolean> {
  const match = transferRead.exec(new URL(route.request().url()).pathname)
  if (!match || route.request().method() !== 'GET') return false
  if (match[1]) await route.fulfill({ json: [], headers: { 'Cache-Control': 'no-store' } })
  else await route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ status: 404, title: 'Not Found' }) })
  return true
}
