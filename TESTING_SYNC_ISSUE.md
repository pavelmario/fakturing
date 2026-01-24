# Data Synchronization Issue - Testing Guide

## Problem Statement
Data synchronization stops working when entering a mnemonic without local IndexedDB data (e.g., in incognito or after clearing data). The data should load from the relay server, but it doesn't.

## Root Cause Analysis

Based on the code and logging, there are two potential issues:

### Issue #1: Relay Server Not Persisting Data
The relay server (`wss://free.evoluhq.com`) might not implement persistent storage:
- It may only broker real-time messages between connected clients
- Push operations may not actually store data on the server
- Pull requests may return empty responses

### Issue #2: IndexedDB Isolation in Incognito
In incognito/private mode:
- Each session has isolated IndexedDB
- Data pushed in session 1 is not accessible in session 2
- This requires a working remote relay to sync across sessions

## Testing Checklist

### Step 1: Test in Normal Mode (Same Session)
1. Open the app: http://localhost:5176
2. In **DevTools Console**, verify connection:
   - Look for: `[Relay] Connected to relay at wss://free.evoluhq.com`
3. Generate or import a mnemonic (use: `adult calm cotton smoke taxi cover steak palm real survey slim child`)
4. Fill in profile fields (name, email, etc.)
5. Click "Save Settings"
6. Look for in console:
   - `[pushToRelay] Preparing to push data for userId: ...`
   - `[saveEncryptedProfile] Profile encrypted and saved to localStorage`
7. **Result**: ✓ Data should be saved locally

### Step 2: Test Relay Push (Same Session - Different Tab)
1. Open another tab to the same URL: http://localhost:5176
2. In **DevTools Console**, enter the mnemonic and look for:
   - `[setActiveMnemonic] Calling checkFallbackRelay...`
   - `[checkFallbackRelay] Checking for userId: ...`
   - `[checkFallbackRelay] ✓ Found data in relay` (if using IndexedDB relay)
   - OR `[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★` (if remote relay has data)
3. **Expected for Issue #1**: Remote relay returns empty pull-response

### Step 3: Test Incognito (New Session)
1. Open incognito window
2. Go to: http://localhost:5176
3. Look for:
   - `[Relay] Connected to relay at wss://free.evoluhq.com`
4. Enter the same mnemonic
5. Look in **DevTools Console** for:
   - `[activateMnemonicAndPull] No local profile found, will pull from relay`
   - `[performPull] userId for this pull: ...`
   - `[performPull] Checking IndexedDB relay store for userId...`
   - `[performPull] ✗ NO data found in IndexedDB relay` (expected - incognito isolation)
   - `[performPull] Sending pull request to remote relay: {"type":"pull","userId":"..."}`
   - **Wait up to 10 seconds for**: `[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★`

### Step 4: Verify Remote Relay Behavior
Look for these specific console logs in incognito pull test:

#### ✓ If Remote Relay Works (stores/returns data):
```
[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★
[handleRelayMessage] Response data present: true
[handleRelayMessage] Response data length: [some_number > 0]
[handleRelayMessage] ✓ Decrypted profile fields: {name: true, email: true, ...}
```

#### ✗ If Remote Relay Doesn't Store (Issue #1):
```
[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★
[handleRelayMessage] Response data present: false
[handleRelayMessage] ✗ pull-response has NO DATA - relay server did not return any stored data
[handleRelayMessage] This indicates the relay server is not persisting data or does not have data for this userId
```

#### ✗ If Remote Relay Doesn't Respond:
No `PULL-RESPONSE RECEIVED` message after waiting 10+ seconds

## Expected vs Actual Behavior

### Expected (Working Sync):
```
Normal Browser Window A:
1. Save settings with mnemonic → "✓ pushed to relay" message

Normal Browser Window B (or Incognito):
1. Enter mnemonic → "Syncing from relay..."
2. Data appears: name, email, phone, etc. → "✓ Loaded from relay"
```

### Actual (Not Working):
```
Normal Browser Window A:
1. Save settings with mnemonic → "✓ pushed to relay" message
2. Data saved in IndexedDB locally

Incognito Browser Window (fresh session):
1. Enter mnemonic → "Syncing from relay..."
2. Nothing appears
3. Console shows: "pull-response has NO DATA"
```

## Next Steps Based on Test Results

### If Issue #1 (Remote Relay Doesn't Persist):
**Solution Options**:
1. **Use a different relay server**:
   - Set up your own relay server (Evolu backend, custom WebSocket server)
   - Configure URL in settings page
2. **Implement a real backend API** instead of WebSocket relay
3. **Accept incognito limitation**: Document that incognito mode only syncs while windows are open

### If Remote Relay Works:
**Next Debug Steps**:
1. Check if push operation is actually sending data
2. Verify mnemonic derivation is consistent
3. Check encryption/decryption round-trip

## Console Log Guide

| Log Pattern | Meaning | Status |
|---|---|---|
| `[Relay] Connected` | Connected to relay | ✓ Good |
| `[pushToRelay] Sending push` | Data being sent | ✓ Expected |
| `[handleRelayMessage] ★★★ PULL-RESPONSE RECEIVED ★★★` | Remote relay responded | ✓ Expected |
| `Response data present: false` | Relay has no stored data | ✗ **Critical Issue** |
| `✓ Decrypted profile fields: {name: true, ...}` | Data loaded successfully | ✓ Good |
| `No data found in IndexedDB relay` | Incognito isolation (expected) | ✓ Expected in incognito |
| No pull-response after 10 seconds | Relay not responding | ✗ **Network issue or server problem** |

## Quick Test Commands

### Clear Local Data for Testing
```javascript
// In browser DevTools console:
localStorage.clear();
indexedDB.deleteDatabase('invoiceApp_relayStore');
indexedDB.deleteDatabase('invoiceApp_relaySettings');
location.reload();
```

### Check Local Storage
```javascript
// In browser DevTools console:
console.log(localStorage.getItem('invoiceApp_mnemonic'));
```

### Check IndexedDB Relay Store
```javascript
// In browser DevTools console:
const db = await new Promise(resolve => {
  const req = indexedDB.open('invoiceApp_relayStore');
  req.onsuccess = () => resolve(req.result);
});
const tx = db.transaction(['relayData'], 'readonly');
tx.objectStore('relayData').getAll().onsuccess = e => console.log(e.target.result);
```

## Environment Info
- **Test Mnemonic**: `adult calm cotton smoke taxi cover steak palm real survey slim child`
- **Default Relay**: `wss://free.evoluhq.com`
- **Test URLs**:
  - Normal: http://localhost:5176
  - Incognito: Open incognito window and go to http://localhost:5176
- **DevTools Location**: F12 → Console tab
- **Server Port**: 5176 (may change if ports busy)

## Report Format
When reporting results, include:
1. **Test executed**: (e.g., "Step 3: Incognito pull test")
2. **Console output**:
   - First 10 lines of relevant logs
   - Presence of "PULL-RESPONSE RECEIVED" message
   - Data presence indicator (Response data present: true/false)
3. **Expected vs Actual**
4. **Screenshots** of console (optional)
