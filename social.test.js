const {test} = require('node:test');
const assert = require('node:assert/strict');
const {PlayerStore, playerName, duration} = require('./social');
function memory() { const data = new Map(); return {getItem: k => data.get(k), setItem: (k, v) => data.set(k, v)}; }
function local(storage = memory()) { let i = 0; return new PlayerStore({storage, uuid: () => `run-${++i}`}); }
test('IDs normalize and reject unsupported names; prototype-like IDs remain ordinary players', async () => {
  assert.equal(playerName(' Ｋkuri_1 '), 'Kkuri_1');
  for (const name of ['', 'a', 'a b', '<script>', '가'.repeat(13)]) assert.throws(() => playerName(name));
  const store = local();
  for (const name of ['constructor', '__proto__']) { await store.selectPlayer(name); assert.equal(store.profile().name, name); }
});
test('best score stays at the best finished run and time accumulates separately per ID', async () => {
  const store = local(); await store.selectPlayer('Ramen');
  store.beginRun(); store.advanceRun(200, 20000); store.finishRun(200);
  store.beginRun(); store.advanceRun(80, 10000); store.finishRun(80); store.finishRun(80);
  assert.deepEqual(store.profile(), {name: 'Ramen', bestScore: 200, playMs: 30000});
  await store.selectPlayer('토끼친구'); store.beginRun(); store.advanceRun(100, 6000); store.finishRun(100);
  assert.deepEqual(store.profile(), {name: '토끼친구', bestScore: 100, playMs: 6000});
  await store.selectPlayer('ramen'); assert.equal(store.profile().bestScore, 200); assert.equal(store.profile().playMs, 30000);
});
test('interrupted progress survives reload once, and blocked storage still permits session play', async () => {
  const storage = memory(), store = local(storage); await store.selectPlayer('꾸리친구');
  store.beginRun(); store.advanceRun(100, 12345); store.persist();
  const restored = local(storage); assert.equal(restored.profile().playMs, 12345); assert.equal(restored.profile().bestScore, 100);
  assert.equal(local(storage).profile().playMs, 12345);
  const blocked = local({getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }});
  await blocked.selectPlayer('라멘친구'); blocked.beginRun(); blocked.advanceRun(100, 6000); blocked.finishRun(100);
  assert.equal(blocked.profile().bestScore, 100); assert.equal(blocked.storageAvailable, false);
  assert.equal(duration(3661000), '01:01:01');
});
function fakeCloud() {
  const server = {best: 0, ms: 0, runs: new Map(), calls: [], loseResponse: false, authCalls: 0};
  server.fetch = async (url, request) => {
    const body = JSON.parse(request.body); server.calls.push(url);
    if (url.endsWith('/signup')) { server.authCalls++; return {ok: true, json: async () => ({access_token: 'test-access', refresh_token: 'test-refresh', expires_in: 3600})}; }
    const profile = () => ({profile_id: 'profile-id', display_name: '라멘친구', best_score: server.best, total_play_ms: server.ms});
    let result;
    if (url.endsWith('kkuri_register_player')) result = profile();
    if (url.endsWith('kkuri_save_run')) {
      const saved = server.runs.get(body.p_run_id) || {ms: 0, finished: false};
      if (!saved.finished && body.p_play_ms >= saved.ms) {
        server.ms += body.p_play_ms - saved.ms; saved.ms = body.p_play_ms; saved.finished = body.p_finished;
        if (saved.finished) server.best = Math.max(server.best, body.p_score);
      }
      server.runs.set(body.p_run_id, saved);
      result = {...profile(), run_play_ms: saved.ms, run_finished: saved.finished};
      if (server.loseResponse) { server.loseResponse = false; throw Error('connection lost after commit'); }
    }
    return {ok: true, json: async () => result};
  };
  return server;
}
test('cloud retry after a committed response is lost neither doubles time nor loses best score', async () => {
  const server = fakeCloud(), storage = memory();
  const store = new PlayerStore({storage, fetch: server.fetch, config: {projectUrl: 'https://test.supabase.co', publishableKey: 'public-test-key'}, uuid: () => 'same-run'});
  await store.selectPlayer('라멘친구'); await store.sync(); store.beginRun();
  store.advanceRun(100, 6000); server.loseResponse = true; store.finishRun(100); await store.sync();
  assert.equal(store.profile().playMs, 6000); assert.equal(store.profile().bestScore, 100);
  await store.sync(); assert.equal(server.ms, 6000); assert.equal(server.best, 100);
  assert.equal(store.profile().playMs, 6000); assert.equal(Object.keys(store.state.runs).length, 0);
  assert.equal(server.authCalls, 1); assert.equal(local(storage).profile().playMs, 6000);
});
test('a new cloud ID must be reserved before play, while an existing player may continue offline', async () => {
  const server = fakeCloud();
  const store = new PlayerStore({storage: memory(), fetch: server.fetch, config: {projectUrl: 'https://test.supabase.co', publishableKey: 'public-test-key'}});
  await store.selectPlayer('라멘친구');
  store.fetch = async () => { throw Error('offline'); };
  await store.selectPlayer('라멘친구'); assert.equal(store.status, 'offline');
  await assert.rejects(store.selectPlayer('새친구'), /등록하지 못했어요/);
  assert.equal(store.profile().name, '라멘친구');
});
test('an expired anonymous session refreshes rather than creating a different owner', async () => {
  const storage = memory();
  storage.setItem('kkuri-player-records-v1', JSON.stringify({profiles: {}, runs: {}, active: null,
    session: {access_token: 'expired-access', refresh_token: 'same-owner-refresh', expires_at: 1}}));
  const calls = [];
  const store = new PlayerStore({storage, config: {projectUrl: 'https://test.supabase.co', publishableKey: 'public-test-key'}, fetch: async (url, request) => {
    calls.push({url, body: JSON.parse(request.body), token: request.headers.Authorization});
    const data = url.includes('/token?') ? {access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600}
      : {profile_id: 'same-player', display_name: '라멘친구', best_score: 100, total_play_ms: 6000};
    return {ok: true, json: async () => data};
  }});
  await store.selectPlayer('라멘친구');
  assert.equal(calls[0].body.refresh_token, 'same-owner-refresh');
  assert.ok(calls[0].url.includes('grant_type=refresh_token'));
  assert.equal(calls[1].token, 'Bearer new-access');
  assert.ok(!calls.some(c => c.url.endsWith('/signup')));
  assert.equal(store.profile().bestScore, 100);
});
