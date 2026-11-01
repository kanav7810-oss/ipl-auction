import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { IPL_PLAYERS } from './src/data/players.js'
import { tickHotspotAuction, decideHotspotRtm } from './src/lib/hotspotAuctionState.js'

// Lightweight in-memory bridge for Hotspot/Offline play.
// Allows normal tabs, incognito windows, and LAN/Wi-Fi devices to share local room state
// without touching any cloud database or consuming Firebase quota.
function hotspotSyncPlugin() {
  const localRooms = new Map();

  return {
    name: 'hotspot-sync-middleware',
    configureServer(server) {
      const tick = setInterval(() => {
        for (const room of localRooms.values()) if (tickHotspotAuction(room)) room._revision = (room._revision || 0) + 1;
      }, 200);
      server.httpServer?.once('close', () => clearInterval(tick));
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (url.startsWith('/api/hotspot-')) res.setHeader('X-Hotspot-Time', String(Date.now()));
        if (url.startsWith('/api/hotspot-rtm/')) {
          const roomId = decodeURIComponent(url.slice('/api/hotspot-rtm/'.length).split('?')[0]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { userId, playerId, useRtm } = JSON.parse(body);
              if (typeof useRtm !== 'boolean') throw new Error('Invalid RTM decision');
              const room = localRooms.get(roomId);
              decideHotspotRtm(room, userId, playerId, useRtm);
              room._revision = (room._revision || 0) + 1;
              res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(room));
            } catch (error) { res.statusCode = 400; res.end(error.message); }
          });
          return;
        }
        if (url.startsWith('/api/hotspot-bid/')) {
          const roomId = decodeURIComponent(url.slice('/api/hotspot-bid/'.length).split('?')[0]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { userId, playerId } = JSON.parse(body); const room = localRooms.get(roomId);
              const live = room?.live; const team = room?.teams?.[`${roomId}_${userId}`];
              const player = IPL_PLAYERS.find(p => p.id === playerId);
              if (!team || !player || live?.playerId !== playerId || live.status !== 'bidding' || Date.now() >= live.timerEndsAt) throw new Error('Bidding is no longer open for this player');
              if (room.players.length === 2 && (room.players.every(p => live.skipVotes?.includes(p.id)) || room.players.every(p => live.roundSkipVotes?.includes(p.id)))) throw new Error('Both players have agreed to skip');
              if (live.highBidderId === userId) throw new Error('You are already the highest bidder');
              const current = live.currentBid || 0;
              const bid = current === 0 ? player.basePrice : Number((current + (current < 5 ? 0.20 : 0.25)).toFixed(2));
              if (team.budgetRemaining < bid) throw new Error('Insufficient purse budget');
              if (team.squad?.length >= room.squadLimit) throw new Error('Squad is full');
              if (player.country !== 'IND' && team.squad.filter(p => IPL_PLAYERS.find(item => item.id === p.id)?.country !== 'IND').length >= room.overseasLimit) throw new Error('Overseas limit reached');
              const manager = room.players.find(p => p.id === userId);
              Object.assign(live, { currentBid: bid, highBidderId: userId, highBidderName: manager.name, highBidderTeamId: team.teamId, timerEndsAt: Date.now() + (room.settings?.bidTimer || 25) * 1000, skipVotes: [], roundSkipVotes: [] });
              room._revision = (room._revision || 0) + 1;
              room.messages ||= []; room.messages.push({ id: `msg_bid_${Date.now()}_${userId}`, userId, userName: manager.name, text: `Bid ₹${bid} Cr by ${team.teamName}`, type: 'bid', timestamp: Date.now() });
              res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(room));
            } catch (error) { res.statusCode = 400; res.end(error.message); }
          });
          return;
        }
        if (url.startsWith('/api/hotspot-presence/')) {
          const roomId = decodeURIComponent(url.slice('/api/hotspot-presence/'.length).split('?')[0]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { userId } = JSON.parse(body); const room = localRooms.get(roomId);
              if (!room?.players?.some(p => p.id === userId)) throw new Error('Unknown player');
              room.presences ||= {}; room.presences[userId] = { online: true, lastSeen: Date.now() };
              res.end('ok');
            } catch { res.statusCode = 400; res.end('Invalid presence'); }
          });
          return;
        }
        if (url.startsWith('/api/hotspot-vote/')) {
          const roomId = decodeURIComponent(url.slice('/api/hotspot-vote/'.length).split('?')[0]);
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { userId, playerId, kind } = JSON.parse(body);
              const room = localRooms.get(roomId);
              if (!room || !room.players?.some(p => p.id === userId) || room.live?.playerId !== playerId || room.live.status !== 'bidding' || room.live.highBidderId || !['player', 'round'].includes(kind) || (kind === 'round' && room.reauction)) throw new Error('Vote is no longer available');
              const key = kind === 'round' ? 'roundSkipVotes' : 'skipVotes';
              room.live[key] = [...new Set([...(room.live[key] || []), userId])];
              room._revision = (room._revision || 0) + 1;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(room));
            } catch (error) { res.statusCode = 400; res.end(error.message); }
          });
          return;
        }
        if (url.startsWith('/api/hotspot-room/')) {
          const roomId = decodeURIComponent(url.replace('/api/hotspot-room/', '').split('?')[0]);
          if (req.method === 'GET') {
            const data = localRooms.get(roomId);
            res.setHeader('Content-Type', 'application/json');
            if (data) {
              res.statusCode = 200;
              res.end(JSON.stringify(data));
            } else {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Room not found' }));
            }
            return;
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                const previous = localRooms.get(roomId);
                if (previous && (parsed._revision || 0) !== (previous._revision || 0)) {
                  res.statusCode = 409; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(previous)); return;
                }
                if (previous?.live?.playerId === parsed.live?.playerId && previous.live.status === 'bidding' && parsed.live.status === 'bidding' && !parsed.live.highBidderId) {
                  for (const key of ['skipVotes', 'roundSkipVotes']) parsed.live[key] = [...new Set([...(previous.live[key] || []), ...(parsed.live[key] || [])])];
                }
                if (previous?.status === 'waiting' && parsed.status === 'active' && parsed.live?.status === 'bidding') parsed.live.timerEndsAt = Date.now() + (parsed.settings?.bidTimer || 25) * 1000;
                parsed._revision = (previous?._revision || 0) + 1;
                localRooms.set(roomId, parsed);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify(parsed));
              } catch {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    hotspotSyncPlugin(),
  ],
  server: {
    host: true, // Listen on all network interfaces so hotspot peers can connect
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            if (id.includes('framer-motion') || id.includes('lucide-react')) {
              return 'icons-motion';
            }
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'react-vendor';
            }
          }
        }
      }
    },
    chunkSizeWarningLimit: 1200
  }
})
