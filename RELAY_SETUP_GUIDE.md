# Quick Setup: Deploy Your Own WebSocket Relay

This guide will help you deploy a simple relay server in under 15 minutes.

## Option A: Local Testing (Localhost)

### Step 1: Create relay server file

Create a file called `relay-server.js`:

```javascript
const WebSocket = require('ws');
const path = require('path');

// In-memory storage (use database for production)
const dataStore = new Map();

// Create WebSocket server on port 8080
const wss = new WebSocket.Server({ port: 8080 });

console.log('🚀 Relay server running on ws://localhost:8080');

wss.on('connection', (ws) => {
  console.log('📱 Client connected');

  ws.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      console.log('📨 Received:', message.type, 'userId:', message.userId?.substring(0, 16) + '...');

      if (message.type === 'push') {
        // Store encrypted data
        dataStore.set(message.userId, {
          data: message.data,
          timestamp: message.timestamp || Date.now()
        });
        console.log(`✅ Stored data for ${message.userId?.substring(0, 16)}...`);

        // Send acknowledgment
        ws.send(JSON.stringify({
          type: 'push-ack',
          userId: message.userId
        }));
      } 
      
      else if (message.type === 'pull') {
        // Retrieve encrypted data
        const stored = dataStore.get(message.userId);
        
        if (stored) {
          console.log(`📦 Returning stored data for ${message.userId?.substring(0, 16)}...`);
        } else {
          console.log(`❌ No data found for ${message.userId?.substring(0, 16)}...`);
        }

        ws.send(JSON.stringify({
          type: 'pull-response',
          userId: message.userId,
          data: stored?.data || null,
          timestamp: stored?.timestamp
        }));
      }
    } catch (error) {
      console.error('❌ Error processing message:', error.message);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
});
```

### Step 2: Install dependencies

```bash
npm init -y
npm install ws
```

### Step 3: Run the relay server

```bash
node relay-server.js
```

You should see:
```
🚀 Relay server running on ws://localhost:8080
```

### Step 4: Update your app to use local relay

1. Open http://localhost:5176 in your browser
2. Go to Settings page
3. Enter relay URL: `ws://localhost:8080`
4. Click "Save Relay URL & Reconnect"
5. You should see: `[Relay] Connected to relay at ws://localhost:8080`

### Step 5: Test sync

1. **Tab 1**: Fill in your profile and save
2. **Tab 2 or Incognito**: Enter same mnemonic → data should load immediately! ✓

## Option B: Deploy to Production

### Using Heroku (Free tier is discontinued, but alternatives exist)

### Using Railway (Recommended - Free tier available)

1. Create a GitHub repository with `relay-server.js` and `package.json`
2. Go to https://railway.app
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Railway auto-detects Node.js and runs it
6. Get your URL from Railway dashboard (e.g., `wss://your-app.railway.app`)
7. Use that URL in your app settings

### Using Replit (Quick & Easy)

1. Go to https://replit.com
2. Create new Node.js project
3. Paste the `relay-server.js` code above
4. Click "Run"
5. Copy the WebSocket URL (shown in output)
6. Use that URL in your app

### Using Your Own VPS (DigitalOcean, Linode, etc.)

```bash
# SSH into your server
ssh root@your-server-ip

# Create project directory
mkdir relay-server
cd relay-server

# Initialize and install
npm init -y
npm install ws

# Create relay-server.js (paste code above)

# Install PM2 to keep it running
npm install -g pm2
pm2 start relay-server.js
pm2 startup
pm2 save
```

Your relay will be at: `wss://your-server-ip:8080`

## Verifying It Works

### From Browser Console

```javascript
// Test 1: Check if relay is reachable
const ws = new WebSocket('ws://localhost:8080');
ws.onopen = () => console.log('✓ Relay is reachable');
ws.onerror = () => console.log('✗ Relay is NOT reachable');

// Test 2: Send a test push
const testUserId = 'test-user-123';
const testData = '{"name":"Test"}';

ws.send(JSON.stringify({
  type: 'push',
  userId: testUserId,
  data: testData
}));

// Test 3: Listen for response
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log('Response:', msg);
  
  if (msg.type === 'push-ack') {
    console.log('✓ Push acknowledged!');
    
    // Now test pull
    ws.send(JSON.stringify({
      type: 'pull',
      userId: testUserId
    }));
  }
  
  if (msg.type === 'pull-response' && msg.data) {
    console.log('✓ Pull returned data!');
    console.log('Data:', msg.data);
  }
};
```

## Troubleshooting

### Relay server won't start
```bash
# Check if port 8080 is already in use
lsof -i :8080

# Kill the process if needed
kill -9 <PID>
```

### Connection refused
- Make sure `relay-server.js` is running: `node relay-server.js`
- Check firewall/port settings if on remote server
- Verify URL in app settings matches server address

### Data not persisting
- Relay uses in-memory storage (lost on restart)
- For production, replace `Map()` with database (MongoDB, PostgreSQL, etc.)
- Or add file-based persistence (see below)

## File-Based Persistence (Optional)

Replace the Map with file storage:

```javascript
const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Instead of: const dataStore = new Map();
const dataStore = {
  set: (userId, value) => {
    fs.writeFileSync(path.join(dataDir, `${userId}.json`), JSON.stringify(value));
  },
  get: (userId) => {
    const file = path.join(dataDir, `${userId}.json`);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
    return null;
  }
};
```

## Summary

- ✅ Local testing: `ws://localhost:8080`
- ✅ Production on Railway: `wss://your-app.railway.app`
- ✅ Data persists between server restarts with file storage
- ✅ Fully encrypted (relay never sees unencrypted data)
- ✅ CORS-free WebSocket communication

Your invoice manager now has a working sync system! 🎉
