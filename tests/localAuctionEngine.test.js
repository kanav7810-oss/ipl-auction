import { IPL_PLAYERS } from '../src/data/players.js';
import { RETAINED, RETAINED_IDS, RTM } from '../src/data/myAuction.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLocalPlayerOrder,
  createLocalRoom,
  readLocalRoom,
  joinLocalRoomDb,
  updateLocalPlayerTeam,
  fillLocalEmptyTeamsWithBots,
  removeLocalBotTeam,
  startLocalAuction,
  placeLocalBid,
  endLocalPlayerAuction,
  pauseLocalAuction,
  resumeLocalAuction,
  endLocalAuction,
} from '../src/lib/localAuctionEngine.js';

test('createLocalRoom creates a room with valid initial data', () => {
  const roomId = 'HOTSPOT-TEST1';
  const result = createLocalRoom(
    roomId,
    'user_123',
    { name: 'Host Manager', team: 'MI' },
    'sprint5',
    false,
  );

  assert.equal(result.server, 'local');
  const room = readLocalRoom(roomId);
  assert.ok(room);
  assert.equal(room.id, roomId);
  assert.equal(room.hostId, 'user_123');
  assert.equal(room.squadLimit, 25);
  assert.equal(room.overseasLimit, 8);
  assert.equal(room.settings.budget, 120.0);
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].team, 'MI');
  assert.ok(room.teams[`${roomId}_user_123`]);
  assert.equal(room.teams[`${roomId}_user_123`].budgetRemaining, 120.0);
});

test('joinLocalRoomDb adds new manager to local room', () => {
  const roomId = 'HOTSPOT-TEST2';
  createLocalRoom(roomId, 'user_host', { name: 'Host', team: 'CSK' }, 'mega');

  joinLocalRoomDb(roomId, 'user_guest', { name: 'Guest', team: 'RCB' });

  const room = readLocalRoom(roomId);
  assert.equal(room.players.length, 2);
  const guest = room.players.find((p) => p.id === 'user_guest');
  assert.ok(guest);
  assert.equal(guest.team, 'RCB');
  assert.ok(room.teams[`${roomId}_user_guest`]);
  assert.equal(room.teams[`${roomId}_user_guest`].budgetRemaining, 120.0);
});

test('local rooms reject bots and a third player', async () => {
  const roomId = 'HOTSPOT-LIMIT';
  createLocalRoom(roomId, 'host', { team: 'MI' });
  assert.throws(() => fillLocalEmptyTeamsWithBots(roomId), /disabled/);
  await joinLocalRoomDb(roomId, 'guest', { team: 'CSK' });
  await assert.rejects(joinLocalRoomDb(roomId, 'third', { team: 'RCB' }), /two players/);
});

test('retained players are seeded and excluded from the auction', async () => {
  const order = generateLocalPlayerOrder();
  assert.equal(order.length, IPL_PLAYERS.length - RETAINED_IDS.size);
  assert.ok(order.every(index => !RETAINED_IDS.has(IPL_PLAYERS[index].id)));
  const roomId = 'HOTSPOT-RETAINED';
  createLocalRoom(roomId, 'host', { team: 'MI' });
  await joinLocalRoomDb(roomId, 'guest', { team: 'CSK' });
  const room = readLocalRoom(roomId);
  for (const [user, side] of [['host', 'me'], ['guest', 'friend']]) {
    const team = room.teams[`${roomId}_${user}`];
    assert.equal(team.side, side);
    assert.deepEqual(team.squad, RETAINED[side].map(id => ({ id, bid: 0, retained: true })));
    assert.deepEqual(team.rtm, { eligible: RTM[side], used: null });
    assert.equal(team.budgetRemaining, 120);
  }
  updateLocalPlayerTeam(roomId, 'host', 'RCB');
  assert.deepEqual(readLocalRoom(roomId).teams[`${roomId}_host`].squad.map(p => p.id), RETAINED.me);
});

test('startLocalAuction transitions room to active and sets live bidding', () => {
  const roomId = 'HOTSPOT-TEST5';
  createLocalRoom(roomId, 'user_host', { name: 'Host', team: 'MI' }, 'mega');

  joinLocalRoomDb(roomId, 'guest', { team: 'CSK' });
  startLocalAuction(roomId);

  const room = readLocalRoom(roomId);
  assert.equal(room.status, 'active');
  assert.equal(room.live.status, 'bidding');
  assert.ok(room.live.playerId);
  assert.equal(room.live.currentBid, 0);
  assert.ok(room.live.timerEndsAt > Date.now());
});

test('placeLocalBid updates currentBid, highBidder, and extends timer', () => {
  const roomId = 'HOTSPOT-TEST6';
  createLocalRoom(roomId, 'user_host', { name: 'Host', team: 'MI' }, 'mega');
  joinLocalRoomDb(roomId, 'guest', { team: 'CSK' });
  startLocalAuction(roomId);

  const room = placeLocalBid(
    roomId,
    'user_host',
    'MI',
    'Host',
    'Mumbai Indians',
  );

  assert.equal(room.live.highBidderId, 'user_host');
  assert.ok(room.live.currentBid > 0);
  assert.equal(room.live.highBidderName, 'Host');
  assert.equal(room.live.highBidderTeamId, 'MI');
});

test('pauseLocalAuction, resumeLocalAuction, and endLocalAuction manage room lifecycle', () => {
  const roomId = 'HOTSPOT-TEST7';
  createLocalRoom(roomId, 'user_host', { name: 'Host', team: 'MI' }, 'mega');
  joinLocalRoomDb(roomId, 'guest', { team: 'CSK' });
  startLocalAuction(roomId);

  pauseLocalAuction(roomId);
  let room = readLocalRoom(roomId);
  assert.equal(room.live.status, 'paused');

  resumeLocalAuction(roomId);
  room = readLocalRoom(roomId);
  assert.equal(room.live.status, 'bidding');

  endLocalAuction(roomId);
  room = readLocalRoom(roomId);
  assert.equal(room.status, 'completed');
  assert.equal(room.live.status, 'completed');
});

