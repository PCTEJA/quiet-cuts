import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadSnapshot, loadArchiveMonths} from '../dist/data-client.js';
const payload = JSON.parse(fs.readFileSync('dist/data/events.json','utf8'));
const ok = body => ({ok:true,json:async()=>body});
test('latest snapshot comes from the API without fetching bundled data', async()=>{
  const calls=[];
  const result=await loadSnapshot('',{fetcher:async url=>{calls.push(url);return ok(payload);}});
  assert.equal(result.fallback,false);
  assert.equal(calls.length,1);
  assert.match(calls[0],/\/rpc\/get_snapshot$/);
});
test('startup outage uses an explicitly labeled baseline',async()=>{
  const result=await loadSnapshot('',{allowFallback:true,fetcher:async url=>{
    if(url==='data/events.json')return ok(payload);
    throw new Error('offline');
  }});
  assert.equal(result.fallback,true);
});
test('missing archive month cannot silently display current or baseline data',async()=>{
  let calls=0;
  await assert.rejects(loadSnapshot('2025-01',{allowFallback:true,fetcher:async url=>{
    calls++;assert.match(url,/p_month=2025-01/);return ok(null);
  }}),/No source snapshot/);
  assert.equal(calls,1);
});
test('polling failures and malformed snapshots are rejected to preserve displayed data',async()=>{
  await assert.rejects(loadSnapshot('',{fetcher:async()=>ok({...payload,events:[]})}),/invalid/);
  await assert.rejects(loadSnapshot('',{fetcher:async()=>({ok:false})}),/unavailable/);
});
test('archive index validates month identifiers',async()=>{
  await assert.rejects(loadArchiveMonths(async()=>ok([{month:'2026-99'}])),/invalid/);
});
