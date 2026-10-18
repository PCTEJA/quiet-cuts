// This publishable key permits public reads, never collector writes by itself.
const API = 'https://ygmxwkmvruiihjzeljtk.supabase.co/rest/v1/rpc/';
const KEY = 'sb_publishable_oc7JG80Vl8gwOYZv1uAtkw_Ge31xTZX';

async function rpc(name, params = {}, fetcher = fetch) {
  const url = new URL(name, API);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetcher(url.href, {
    headers: {apikey: KEY}, cache: 'no-cache', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('The data service is temporarily unavailable.');
  return response.json();
}

export function validateSnapshot(payload) {
  if (!payload || !Array.isArray(payload.events) || !payload.metadata ||
      !payload.events.length || payload.events.length !== payload.metadata.totalRecords ||
      new Set(payload.events.map(e => e.id)).size !== payload.events.length ||
      !payload.events.every(e => typeof e.company === 'string' && Number.isInteger(e.workers) && e.workers >= 0 && ['CA','NY','WA'].includes(e.state))) {
    throw new Error('The source snapshot is missing or invalid.');
  }
  for (const state of ['CA','NY','WA']) {
    if (payload.events.filter(e => e.state === state).length !== payload.metadata.counts?.[state]) {
      throw new Error('Source counts are inconsistent.');
    }
  }
  return payload;
}

export async function loadSnapshot(month = '', {allowFallback = false, fetcher = fetch} = {}) {
  try {
    const payload = await rpc('get_snapshot', month ? {p_month: month} : {}, fetcher);
    if (!payload) throw new Error('No source snapshot was captured for this month.');
    return {payload: validateSnapshot(payload), fallback: false};
  } catch (error) {
    // A static baseline is only a labeled startup fallback, never an archive substitute.
    if (!allowFallback || month) throw error;
    const response = await fetcher('data/events.json', {cache: 'no-cache'});
    if (!response.ok) throw error;
    return {payload: validateSnapshot(await response.json()), fallback: true};
  }
}

export async function loadArchiveMonths(fetcher = fetch) {
  const months = await rpc('get_archive_months', {}, fetcher);
  if (!Array.isArray(months) || !months.every(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month))) {
    throw new Error('Archive index is invalid.');
  }
  return months;
}
