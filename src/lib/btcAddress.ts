/**
 * Finding a Bitcoin address in free text.
 *
 * Fakturoid has no bitcoin payment method — an invoice payable in BTC still
 * reads `payment_method: bank`, because it is payable either way — so an
 * address written into the note is the only signal there is that the invoice
 * takes BTC at all. The same rule serves the importer and the one-time
 * backfill for invoices brought in before it existed.
 */

const BECH32 = /\b(bc1[02-9ac-hj-np-z]{11,71}|BC1[02-9AC-HJ-NP-Z]{11,71})\b/;
const BASE58 = /\b[13][1-9A-HJ-NP-Za-km-z]{25,34}\b/;
/* No closing boundary on "bitcoin": Czech declines it — bitcoinem, bitcoinu —
   and `\bbitcoin\b` matches none of those. */
const MENTIONS_BTC = /\bbtc\b|\bbitcoin/i;

/**
 * The first Bitcoin address in the given texts, or null.
 *
 * A `bc1…` address is unmistakable on its own. A legacy `1…`/`3…` one is 26
 * to 35 characters of base58, which a long reference number can imitate, so
 * it counts only where the text also says BTC: flagging an invoice by mistake
 * would put a payment code on it that nobody meant to offer.
 */
export const findBtcAddress = (
  ...texts: readonly (string | null | undefined)[]
): string | null => {
  for (const text of texts) {
    if (!text) continue;
    const bech32 = BECH32.exec(text);
    if (bech32) return bech32[0];
    if (!MENTIONS_BTC.test(text)) continue;
    const base58 = BASE58.exec(text);
    if (base58) return base58[0];
  }
  return null;
};
