import { useState } from 'react';
import { IPL_PLAYERS } from '../data/players';

export default function CurrentRoundPanel({ room, live }) {
  const [open, setOpen] = useState(false);
  const order = room.playerOrder || [];
  const playerId = live?.playerId;
  const pos = room.reauction ? order.findLastIndex(i => IPL_PLAYERS[i]?.id === playerId) : order.findIndex(i => IPL_PLAYERS[i]?.id === playerId);
  const player = IPL_PLAYERS.find(p => p.id === playerId);
  const currentSet = player?.set;
  const sold = new Set(Object.values(room.teams || {}).flatMap(team => (team.squad || []).map(p => p.id)));
  const remaining = pos < 0 ? [] : order.slice(pos + 1).map(index => IPL_PLAYERS[index]).filter(p => p && !sold.has(p.id) && (room.reauction || p.set === currentSet));
  const label = room.reauction ? 'Final round · Unsold players' : `Current round · ${currentSet || 'Auction'}`;
  return <div className="w-full border-b border-white/10 bg-black/60 px-3 py-2 text-white">
    <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left text-xs font-bold">
      <span>{label}</span><span className="text-orange-300">{remaining.length} left {open ? '▴' : '▾'}</span>
    </button>
    {open && <div className="mt-2 max-h-36 overflow-y-auto text-xs text-gray-300"><p className="mb-1 text-gray-400">Up next in this {room.reauction ? 'final round' : 'set'}:</p>{remaining.length ? remaining.map(p => <div key={p.id} className="py-0.5">{p.name}</div>) : <p>No players left after the current player.</p>}</div>}
  </div>;
}
