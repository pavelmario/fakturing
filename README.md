# Invoice Manager

A React web-based invoice manager application with local-first storage synchronized to Evolu relay.

## Features

- **Settings Page**: Configure your backup phrase and profile
  - Generate a random 12 or 24-word backup phrase using BIP39
  - Import your existing backup phrase
  - Store your profile information (name)
  - All data is saved locally and synced to the Evolu relay

- **Local-First Architecture**: Data stored locally with automatic sync to relay
- **Secure**: Uses industry-standard BIP39 mnemonics for backup phrases
- **Real-time Sync**: Data automatically synces to `wss://free.evoluhq.com`

## Tech Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Storage**: LocalStorage + Evolu relay sync
- **Cryptography**: BIP39 for mnemonic generation

## Getting Started

### Prerequisites

- Node.js (v20+)
- npm or yarn

### Installation

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## Project Structure

```
src/
├── components/
│   └── SettingsPage.tsx    # Settings page with mnemonic and profile form
├── db.ts                    # Local-first database and relay sync
├── App.tsx                  # Main app component
├── main.tsx                 # Entry point
└── index.css               # Tailwind CSS styles
```

## How It Works

1. **Backup Phrase Setup**: Users can either generate a random BIP39-compliant mnemonic or import their existing one
2. **Profile Configuration**: Users enter their name
3. **Local Storage**: All data is stored in browser's localStorage
4. **Relay Sync**: Data is automatically synced to the Evolu relay at `wss://free.evoluhq.com`

## Future Enhancements

- [ ] Full Evolu integration with proper database schema
- [ ] Invoice creation and management
- [ ] Invoice templates
- [ ] Export/print invoices
- [ ] Client management
- [ ] Multi-user support
- [ ] Offline-first capabilities

## License

MIT

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

# fakturing
