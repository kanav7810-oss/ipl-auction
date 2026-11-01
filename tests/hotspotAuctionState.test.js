import test from 'node:test';
import assert from 'node:assert/strict';
import { tickHotspotAuction, decideHotspotRtm } from '../src/lib/hotspotAuctionState.js';
import { IPL_PLAYERS } from '../src/data/players.js';

const player = IPL_PLAYERS.find(p => p.id === 'p_128');
function room() {
  return { id: 'test', status: 'active', squadLimit: 25, overseasLimit: 8, settings: { bidTimer: 25 }, players: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], teams: { a: { userId: 'a', teamId: 'RCB', teamName: 'Team A', budgetRemaining: 120, spent: 0, squad: [], rtm: { eligible: [player.id], used: null } }, b: { userId: 'b', teamId: 'PBKS', teamName: 'Team B', budgetRemaining: 120, spent: 0, squad: [], rtm: { eligible: [], used: null } } }, playerOrder: [IPL_PLAYERS.indexOf(player)], live: { status: 'bidding', playerId: player.id, timerEndsAt: 1000, currentBid: 4, highBidderId: 'b', highBidderName: 'B', highBidderTeamId: 'PBKS' }, messages: [] };
}

test('RTM matches the final bid once and charges the claiming side', () => {
  const state = room();
  assert.equal(tickHotspotAuction(state, 1000), true);
  assert.equal(state.live.status, 'rtm');
  assert.throws(() => decideHotspotRtm(state, 'b', player.id, true, 1001));
  decideHotspotRtm(state, 'a', player.id, true, 1001);
  assert.equal(state.teams.a.budgetRemaining, 116);
  assert.equal(state.teams.a.rtm.used, player.id);
  assert.deepEqual(state.teams.a.squad, [{ id: player.id, bid: 4, rtm: true }]);
  assert.equal(state.teams.b.budgetRemaining, 120);
  assert.throws(() => decideHotspotRtm(state, 'a', player.id, true, 1002));
});

test('RTM pass and timeout award the original bidder', () => {
  for (const pass of [true, false]) {
    const state = room(); tickHotspotAuction(state, 1000);
    if (pass) decideHotspotRtm(state, 'a', player.id, false, 1001);
    else tickHotspotAuction(state, 21000);
    assert.equal(state.live.highBidderId, 'b');
    assert.equal(state.teams.b.budgetRemaining, 116);
    assert.equal(state.teams.a.rtm.used, null);
  }
});

test('RTM is unavailable when used, unaffordable or held by the winning team', () => {
  for (const condition of ['used', 'budget', 'winner']) {
    const state = room();
    if (condition === 'used') state.teams.a.rtm.used = 'previous';
    if (condition === 'budget') state.teams.a.budgetRemaining = 3;
    if (condition === 'winner') { state.live.highBidderId = 'a'; state.live.highBidderTeamId = 'RCB'; }
    tickHotspotAuction(state, 1000);
    assert.equal(state.live.status, 'sold');
  }
});

test('two skip votes defer a player to the final round exactly once', () => {
  const state = room(); state.live.highBidderId = ''; state.live.skipVotes = ['a', 'b'];
  tickHotspotAuction(state, 100);
  assert.equal(state.live.status, 'unsold');
  tickHotspotAuction(state, 2100);
  assert.equal(state.reauction, true);
  assert.equal(state.live.playerId, player.id);
  state.live.timerEndsAt = 2200; tickHotspotAuction(state, 2200); tickHotspotAuction(state, 4200);
  assert.equal(state.status, 'completed');
});

test('agreeing to skip a set defers its remaining players until the final pass', () => {
  const state = room();
  const first = IPL_PLAYERS.findIndex(p => p.id === 'p_lan_maxwell');
  const second = IPL_PLAYERS.findIndex(p => p.id === 'p_lan_russell');
  const next = IPL_PLAYERS.findIndex(p => p.set !== IPL_PLAYERS[first].set);
  state.playerOrder = [first, second, next];
  state.live = { playerId: IPL_PLAYERS[first].id, status: 'bidding', timerEndsAt: 5000, currentBid: 0, highBidderId: '', roundSkipVotes: ['a', 'b'] };
  tickHotspotAuction(state, 1000);
  assert.equal(state.live.status, 'unsold');
  assert.deepEqual(new Set(state.unsoldIndices), new Set([first, second]));
  tickHotspotAuction(state, 3000);
  assert.equal(state.live.playerId, IPL_PLAYERS[next].id);
});
