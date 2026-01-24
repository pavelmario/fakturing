# Invoice Manager - Development Guide

## Project Overview

Invoice Manager is a React-based web application for managing invoices with local-first storage synchronized to an Evolu relay. The application starts with a settings page where users can configure their backup phrase and profile.

## Technology Stack

- **Frontend**: React 19.2.3 with TypeScript
- **Build Tool**: Vite 7.3.1
- **Styling**: Tailwind CSS 4.0.0
- **Database**: LocalStorage with Evolu relay sync
- **Cryptography**: BIP39 for mnemonic generation and validation

## Project Structure

```
inv-r/
├── src/
│   ├── components/
│   │   └── SettingsPage.tsx    # Settings page component
│   ├── db.ts                    # Local-first storage and relay sync
│   ├── App.tsx                  # Main app component
│   ├── main.tsx                 # React app entry point
│   ├── index.css               # Tailwind CSS directives
│   ├── App.css                 # (deprecated, unused)
│   └── assets/
├── public/
├── index.html                   # HTML entry point
├── tailwind.config.js          # Tailwind CSS configuration
├── postcss.config.js           # PostCSS configuration for Tailwind
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
└── package.json                # Project dependencies

```

## Key Features Implemented

### 1. Settings Page (src/components/SettingsPage.tsx)
- Backup phrase generation using BIP39 (12 or 24 words)
- Import existing backup phrase with validation
- User profile form with name field
- Connection status indicator for relay
- Save functionality with local and relay sync

### 2. Database Layer (src/db.ts)
- Local-first storage using browser's localStorage
- Relay connection to `wss://free.evoluhq.com`
- Automatic sync on save
- UserProfile interface with metadata (id, timestamps)

### 3. UI/UX
- Tailwind CSS for responsive design
- Clean gradient background
- Form validation for mnemonic and name
- Connection status indicator
- Success feedback messages

## Development Workflow

### Starting Development Server
```bash
npm run dev
```
Server runs at `http://localhost:5173`

### Building for Production
```bash
npm run build
npm run preview
```

### Type Checking
```bash
npx tsc --noEmit
```

## Dependencies

- **@evolu/react**: 10.4.0 - React components for Evolu (local-first database)
- **bip39**: Latest - BIP39 standard for mnemonic phrases
- **tailwindcss**: 4.0.0 - Utility-first CSS framework
- **react**: 19.2.3 - React library
- **typescript**: 5.7.2 - TypeScript compiler

## Relay Connection

The application connects to the Evolu relay at `wss://free.evoluhq.com` to enable:
- Real-time data synchronization
- Multi-device support (when implemented)
- Data backup and recovery

## Next Steps / Future Enhancements

1. **Evolu Integration**: Migrate from localStorage to proper Evolu database with full typing
2. **Invoice Management**: Create invoice CRUD operations
3. **Invoice List**: Display and manage invoices
4. **Invoice Templates**: Pre-configured invoice formats
5. **Client Management**: Store and manage client information
6. **Export/Print**: Generate PDF and print invoices
7. **Authentication**: User authentication with mnemonic
8. **Multi-user Support**: Enable collaboration features
9. **Offline-first**: Full offline support with sync when online

## Known Issues

- Evolu relay connection uses basic WebSocket implementation. Will be enhanced with proper Evolu client integration
- No persistent relay authentication (to be implemented)

## Troubleshooting

### Build Errors
If you encounter peer dependency errors:
```bash
npm install --legacy-peer-deps
```

### Vite Dev Server Issues
Clear Vite cache:
```bash
rm -rf node_modules/.vite
npm run dev
```

### TypeScript Errors
Ensure TypeScript types are up to date:
```bash
npm install --save-dev typescript@latest
```
