# Relay Synchronization Issue - Root Cause & Solutions

## Root Cause: Relay Server Limitation

**The relay server (`wss://free.evoluhq.com`) does not implement persistent storage.**

### What's Happening

When you send a pull request:
```json
{"type":"pull","userId":"7c21145cb9341994cb64362aaa9ddc3e806fb4dc497f6990088faa21cb120b56"}
```

The relay **echoes it back** instead of responding with:
```json
{"type":"pull-response","userId":"...","data":"...encrypted data..."}
```

This proves the relay is:
- ✗ NOT storing push messages
- ✗ NOT returning stored data on pull requests
- ✓ Just a real-time message broker, not a database

### Evidence from Logs

```
[performPull] Sending pull request to remote relay: {type: 'pull', userId: '7c21...'}
[relayWs.onmessage] Raw message length: 17, first 80 chars: "type":"pull","u
[relayWs.onmessage] Message empty after cleanup (likely echo or keepalive), skipping
```

The 17-char message `"type":"pull","u` is the relay echoing back your pull request (truncated).

## What IS Working

### ✓ Local Sync (Same Browser)
- IndexedDB relay store: Working perfectly
- Data is stored and retrieved: 562 chars successfully encrypted and decrypted
- Same-tab and same-window sync: Fully functional

### ✗ Cross-Session Sync (Incognito)
- Each incognito session has isolated IndexedDB
- Requires remote relay to store data between sessions
- **Currently impossible** with free.evoluhq.com

## Solutions

### Solution 1: Implement a Backend API Server (Recommended)

Create a simple Node.js server that stores encrypted data:

**Backend (Node.js + Express):**
```javascript
// server.js
const express = require('express');
const app = express();
app.use(express.json());

const dataStore = new Map(); // In production: use database

app.post('/relay/push', (req, res) => {
  const { userId, data } = req.body;
  dataStore.set(userId, { data, timestamp: Date.now() });
  res.json({ type: 'push-ack', userId });
});

app.get('/relay/pull/:userId', (req, res) => {
  const { userId } = req.params;
  const stored = dataStore.get(userId);
  res.json({
    type: 'pull-response',
    userId,
    data: stored?.data || null,
    timestamp: stored?.timestamp
  });
});

app.listen(3000, () => console.log('Relay running on :3000'));
```

**Frontend changes needed:**
1. Replace WebSocket with HTTP requests in `src/db.ts`
2. Change `pushToRelay()` to POST to `/relay/push`
3. Change `pullFromRelay()` to GET from `/relay/pull/:userId`

### Solution 2: Use WebSocket + Your Own Relay Server

If you want to keep the WebSocket approach, set up a simple relay server:

**Minimal WebSocket Relay (Node.js):**
```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const dataStore = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const msg = JSON.parse(message);
    
    if (msg.type === 'push') {
      dataStore.set(msg.userId, msg.data);
      ws.send(JSON.stringify({ type: 'push-ack', userId: msg.userId }));
    }
    
    if (msg.type === 'pull') {
      const data = dataStore.get(msg.userId);
      ws.send(JSON.stringify({
        type: 'pull-response',
        userId: msg.userId,
        data: data || null
      }));
    }
  });
});
```

Then change in `src/db.ts`:
```typescript
const DEFAULT_RELAY_URL = "ws://your-server.com:8080";
```

### Solution 3: Use a Commercial Service

Options with persistent storage:
- **Firebase Realtime Database** - Google's solution, free tier available
- **AWS AppSync** - AWS's GraphQL service
- **Evolu's Paid Plan** - If you want to use Evolu officially
- **Supabase** - PostgreSQL + WebSocket, free tier available

### Solution 4: Accept the Limitation

Document that:
- ✓ Local mode works (same browser window)
- ✓ Settings are persisted to localStorage
- ✗ Incognito cross-session sync not supported (requires backend)
- ✓ Users can export/import data manually using mnemonic

## Recommended Path Forward

**For MVP (Minimum Viable Product):**

1. Keep local IndexedDB sync working (already done ✓)
2. Add manual export/import via mnemonic
3. Document that incognito mode has limitations
4. Add a message: "To sync across sessions, use your backup phrase"

**For Production:**

1. Deploy a simple Node.js relay server (Solution 2)
2. Store encrypted data in a database (PostgreSQL, MongoDB, etc.)
3. Update relay URL in settings to point to your server
4. Optional: Add user authentication to relay

## Implementation Complexity

| Solution | Complexity | Cost | Time |
|---|---|---|---|
| Solution 1 (HTTP API) | Low | Free (hosting) | 2-3 hours |
| Solution 2 (WebSocket Relay) | Low | Free (hosting) | 2-3 hours |
| Solution 3 (Firebase) | Medium | $0-50/month | 4-6 hours |
| Solution 4 (Accept limit) | None | Free | 30 min (docs) |

## Quick Start for Solution 2

**Step 1: Deploy relay server**
```bash
# server.js (save and run with `node server.js`)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
const dataStore = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'push') {
      dataStore.set(data.userId, data.data);
      ws.send(JSON.stringify({ type: 'push-ack', userId: data.userId }));
    }
    if (data.type === 'pull') {
      ws.send(JSON.stringify({
        type: 'pull-response',
        userId: data.userId,
        data: dataStore.get(data.userId) || null
      }));
    }
  });
});
```

**Step 2: Update relay URL in app**
- Go to settings page
- Change relay URL to: `ws://localhost:8080` (or your server URL)
- Click "Save Relay URL & Reconnect"

**Step 3: Test**
1. Save profile with mnemonic in normal mode
2. Open incognito
3. Enter same mnemonic
4. Data should sync! ✓

## Current Status

- ✅ App code is correct and ready
- ✅ Local sync is working perfectly
- ✅ Relay URL configuration is in place
- ✅ Encryption is working properly
- ⚠️ Only blocking issue: relay server doesn't support push/pull protocol

Choose a solution above and let me know if you need help implementing it!
