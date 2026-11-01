import { IPL_PLAYERS } from '../data/players.js';

const playerById = id => IPL_PLAYERS.find(player => player.id === id);
const log = (room, text, now, type = 'log', metadata = null) => {
  room.messages ||= [];
  room.messages.push({ id: `msg_${now}_${room.messages.length}`, userId: 'system', userName: 'System', text, type, timestamp: now, metadata });
};
const canClaim = (room, team, player, price) => Boolean(team && !team.rtm?.used && team.rtm?.eligible?.includes(player.id) && team.budgetRemaining >= price && (team.squad || []).length < room.squadLimit && (player.country === 'IND' || (team.squad || []).filter(item => playerById(item.id)?.country !== 'IND').length < room.overseasLimit));

function settle(room, now, winnerId = null, rtm = false) {
  const live = room.live;
  const player = playerById(live.playerId);
  if (winnerId) {
    const team = Object.values(room.teams).find(item => item.userId === winnerId);
    team.budgetRemaining = Number((team.budgetRemaining - live.currentBid).toFixed(2));
    team.spent = Number(((team.spent || 0) + live.currentBid).toFixed(2));
    team.squad.push({ id: live.playerId, bid: live.currentBid, ...(rtm ? { rtm: true } : {}) });
    if (rtm) team.rtm.used = live.playerId;
    const manager = room.players.find(p => p.id === winnerId);
    if (manager) { manager.spent = team.spent; manager.squadCount = team.squad.length; }
    Object.assign(live, { status: 'sold', highBidderId: winnerId, highBidderName: manager?.name || team.teamName, highBidderTeamId: team.teamId });
    log(room, `${player.name} SOLD to ${team.teamName} for ₹${live.currentBid} Cr${rtm ? ' via RTM' : ''}`, now, 'sold_card', { playerId: player.id, teamId: team.teamId, bid: live.currentBid, buyerId: winnerId, buyerName: manager?.name || team.teamName });
  } else {
    live.status = 'unsold';
    if (!room.reauction) {
      room.unsoldIndices ||= [];
      const index = IPL_PLAYERS.findIndex(p => p.id === live.playerId);
      if (index >= 0 && !room.unsoldIndices.includes(index)) room.unsoldIndices.push(index);
    }
    log(room, `${player?.name || 'Player'} UNSOLD`, now);
  }
  live.advanceAt = now + (winnerId ? 4000 : 2000);
}

export function tickHotspotAuction(room, now = Date.now()) {
  if (room?.status !== 'active' || !room.live) return false;
  const live = room.live;
  if (live.status === 'bidding') {
    const voters = room.players || [];
    const all = key => voters.length === 2 && voters.every(p => live[key]?.includes(p.id));
    const roundSkip = all('roundSkipVotes');
    const playerSkip = all('skipVotes');
    if (!roundSkip && !playerSkip && now < live.timerEndsAt) return false;
    if (roundSkip && !room.reauction) {
      const pos = room.playerOrder.findIndex(i => IPL_PLAYERS[i]?.id === live.playerId);
      const set = IPL_PLAYERS[room.playerOrder[pos]]?.set;
      let end = pos + 1;
      while (end < room.playerOrder.length && IPL_PLAYERS[room.playerOrder[end]]?.set === set) end++;
      room.unsoldIndices ||= [];
      room.unsoldIndices.push(...room.playerOrder.splice(pos + 1, end - pos - 1));
    }
    if (live.highBidderId && !roundSkip && !playerSkip) {
      const player = playerById(live.playerId);
      const claimant = Object.values(room.teams || {}).find(team => team.userId !== live.highBidderId && player && canClaim(room, team, player, live.currentBid));
      if (claimant) {
        Object.assign(live, { status: 'rtm', rtmEligibleUserId: claimant.userId, rtmEndsAt: now + 20000 });
        log(room, `${claimant.teamName} may use RTM for ${player.name} at ₹${live.currentBid} Cr.`, now);
      } else settle(room, now, live.highBidderId);
    } else settle(room, now);
    return true;
  }
  if (live.status === 'rtm' && now >= live.rtmEndsAt) { settle(room, now, live.highBidderId); return true; }
  if ((live.status === 'sold' || live.status === 'unsold') && now >= live.advanceAt) {
    const order = room.playerOrder;
    const pos = room.reauction ? order.findLastIndex(i => IPL_PLAYERS[i]?.id === live.playerId) : order.findIndex(i => IPL_PLAYERS[i]?.id === live.playerId);
    let next = order[pos + 1];
    if (next === undefined && !room.reauction && room.unsoldIndices?.length) {
      room.reauction = true;
      room.playerOrder.push(...room.unsoldIndices);
      next = room.unsoldIndices[0];
      log(room, 'Unsold players return for a final auction.', now);
    }
    if (next === undefined) { room.status = 'completed'; live.status = 'completed'; log(room, 'Auction COMPLETED!', now); }
    else room.live = { playerId: IPL_PLAYERS[next].id, currentBid: 0, highBidderId: '', highBidderName: 'No Bids', highBidderTeamId: '', timerEndsAt: now + (room.settings?.bidTimer || 25) * 1000, status: 'bidding' };
    return true;
  }
  return false;
}

export function decideHotspotRtm(room, userId, playerId, useRtm, now = Date.now()) {
  const live = room?.live;
  if (room?.status !== 'active' || live?.status !== 'rtm' || live.playerId !== playerId || live.rtmEligibleUserId !== userId || now >= live.rtmEndsAt) throw new Error('RTM is no longer available.');
  const team = Object.values(room.teams || {}).find(item => item.userId === userId);
  if (useRtm && !canClaim(room, team, playerById(playerId), live.currentBid)) throw new Error('This team cannot use RTM for this player.');
  settle(room, now, useRtm ? userId : live.highBidderId, useRtm);
}
