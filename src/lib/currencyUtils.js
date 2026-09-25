// Currency conversion utility for TripSync
// Uses frankfurter.app — free, no API key, ECB rates

export const SUPPORTED_CURRENCIES = [
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "USD", symbol: "$", name: "US Dollar" },
];

let cachedRates = null;
let cachedAt = null;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

export async function fetchExchangeRate(from, to) {
  if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) };
  
  // Check cache
  const cacheKey = `${from}_${to}`;
  if (cachedRates && cachedRates[cacheKey] && (Date.now() - cachedAt) < CACHE_TTL) {
    return cachedRates[cacheKey];
  }

  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
    if (!res.ok) throw new Error("Rate service unavailable");
    const data = await res.json();
    const rate = data.rates[to];
    if (!rate) throw new Error("Rate not found");
    const result = { rate, date: data.date };
    if (!cachedRates) cachedRates = {};
    cachedRates[cacheKey] = result;
    cachedAt = Date.now();
    return result;
  } catch (e) {
    // Fallback: return null, caller should handle
    return null;
  }
}

export function convertAmount(amount, rate) {
  if (!amount || !rate) return amount;
  return Math.round(amount * rate * 100) / 100;
}

export function formatCurrency(amount, currency) {
  const cur = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  const symbol = cur?.symbol || currency || "";
  const formatted = (amount || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${symbol}${formatted}`;
}

export function getCurrencySymbol(currency) {
  const cur = SUPPORTED_CURRENCIES.find((c) => c.code === currency);
  return cur?.symbol || currency || "";
}