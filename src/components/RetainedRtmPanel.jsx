import { useState } from 'react';
import { IPL_PLAYERS } from '../data/players';

const names = new Map(IPL_PLAYERS.map(player => [player.id, player.name]));

export default function RetainedRtmPanel({ roomTeams, userId }) {
  const [open, setOpen] = useState(false);
  const teams = ['me', 'friend'].map(side => roomTeams.find(team => team.side === side));
  const ownerOf = id => roomTeams.find(team => team.squad?.some(player => player.id === id));
  return <>
    <button className="fixed bottom-20 left-3 z-[80] rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white shadow-lg" onClick={() => setOpen(true)}>Retained &amp; RTM</button>
    {open && <div className="fixed inset-0 z-[120] bg-black/70" onClick={() => setOpen(false)}>
      <aside role="dialog" aria-modal="true" aria-label="Retained and RTM" className="h-full w-full max-w-lg overflow-y-auto bg-[#111318] p-5 text-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Retained &amp; RTM</h2><button className="rounded-lg p-2" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
        <p className="mt-2 text-sm text-gray-400">RTM is display-only; players remain in the auction pool.</p>
        {teams.map((team, index) => <section key={index} className="mt-5 rounded-xl border border-white/10 p-4">
          <h3 className="font-bold">{index === 0 ? 'Team A · Kohli' : 'Team B · Dhawan'} {team?.userId === userId ? '(you)' : ''}{team ? ` — ${team.teamName}` : ' — waiting'}</h3>
          {team && <>
            <p className="mt-2 text-sm text-gray-300">Purse ₹{team.budgetRemaining} Cr · Squad {team.squad?.length || 0} · RTM {team.rtm?.used ? `used (${names.get(team.rtm.used) || team.rtm.used})` : 'available'}</p>
            <h4 className="mt-4 font-semibold">Retained</h4><ul className="text-sm text-gray-300">{team.squad?.filter(p => p.retained).map(p => <li key={p.id}>{names.get(p.id)}</li>)}</ul>
            <h4 className="mt-4 font-semibold">Bought</h4><ul className="text-sm text-gray-300">{team.squad?.filter(p => !p.retained).map(p => <li key={p.id}>{names.get(p.id)} · ₹{p.bid} Cr</li>)}</ul>
            {!team.squad?.some(p => !p.retained) && <p className="text-sm text-gray-400">None yet</p>}
            <h4 className="mt-4 font-semibold">RTM eligible</h4><ul className="space-y-1 text-sm text-gray-300">{team.rtm?.eligible.map(id => { const owner = ownerOf(id); const purchase = owner?.squad.find(p => p.id === id); return <li key={id} className="flex justify-between gap-3"><span>{names.get(id)}</span><span className="text-gray-400">{!owner ? 'In pool' : owner.userId === team.userId ? 'Yours' : `Sold ${purchase.bid} Cr · RTM open`}</span></li>; })}</ul>
          </>}
        </section>)}
      </aside>
    </div>}
  </>;
}
