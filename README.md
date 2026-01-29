# Invoice Manager

A React web-based invoice manager with local-first storage and Evolu relay sync.

## Features

- **Settings & profile**
  - BIP39 backup phrase generation and restore
  - Company profile, banking details, invoice footer text
  - VAT payer toggle, PO number requirement toggle
  - Discrete mode for hiding totals in overview
  - Relay URL configuration and connection status
  - Bitcoin mempool explorer URL customization

- **Clients (adresář)**
  - Create, search, view, edit, and delete clients
  - ARES lookup by IČO to prefill company details

- **Invoices**
  - Create, edit, delete, and duplicate invoices
  - Automatic invoice numbering per year with duplicate detection
  - Line items with optional VAT columns
  - Status tracking (paid/unpaid/overdue), mark as paid or undo payment
  - Filters by year, status, and payment type; dashboard stats
  - Bitcoin invoices with address and mempool link
  - Czech QR payment generation for bank transfers
  - PDF export (A4) with supplier/customer details and totals

- **CSV import/export**
  - Import settings, clients, and invoices from CSV
  - Export all data to CSV
  - Template files for imports in public/

- **Local-first + sync**
  - Data stored locally and synced via Evolu relay (`wss://free.evoluhq.com`)
  - Works offline and syncs when online

## Tech Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Local-first data**: Evolu (`@evolu/common`, `@evolu/react`, `@evolu/react-web`)
- **PDF export**: `@react-pdf/renderer`
- **QR generation**: `qrcode`
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
│   ├── SettingsPage.tsx       # Settings, CSV import/export, relay config
│   ├── ClientsListPage.tsx    # Clients overview + search
│   ├── ClientsPage.tsx        # Create client (ARES lookup)
│   ├── ClientDetailPage.tsx   # Edit/delete client
│   ├── InvoiceListPage.tsx    # Invoice dashboard + filters
│   ├── InvoiceCreatePage.tsx  # Create invoice
│   └── InvoiceDetailPage.tsx  # Edit, duplicate, PDF export
├── evolu.ts                   # Evolu schema + provider
├── App.tsx                    # Main app shell/navigation
├── main.tsx                   # Entry point
└── index.css                  # Tailwind CSS styles
```

## How It Works

1. **Backup Phrase Setup**: Generate or restore a BIP39-compliant mnemonic
2. **Profile Configuration**: Fill in supplier details, VAT status, bank account, and preferences
3. **Local-first Storage**: Data is stored locally using Evolu
4. **Relay Sync**: Changes sync to the Evolu relay at `wss://free.evoluhq.com`
5. **Operational Flow**: Manage clients and invoices, export PDFs or CSV, and import data when needed

## License

MIT

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

# fakturing
