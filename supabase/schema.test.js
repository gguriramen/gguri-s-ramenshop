const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
let db, a, b;
const ownerA = '10000000-0000-4000-8000-000000000001', ownerB = '10000000-0000-4000-8000-000000000002';
const runA = '20000000-0000-4000-8000-000000000001';
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    insert into auth.users values ('${ownerA}'), ('${ownerB}');`);
  const schema = fs.readFileSync(__dirname + '/schema.sql', 'utf8');
  await db.exec(schema); await db.exec(schema);
});
after(async () => { await db.close(); });
async function asUser(owner, sql, args = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${owner}', false);`);
  try { return await db.query(sql, args); } finally { await db.exec('reset role;'); }
}
async function register(owner, name) { return (await asUser(owner, 'select public.kkuri_register_player($1) as data', [name])).rows[0].data; }
async function save(owner, profile, run, score, ms, finished) {
  return (await asUser(owner, 'select public.kkuri_save_run($1,$2,$3,$4,$5) as data', [profile, run, score, ms, finished])).rows[0].data;
}
test('IDs belong to the registering anonymous user, normalize case, and reject conflicts', async () => {
  a = await register(ownerA, 'Ramen_1'); b = await register(ownerB, '토끼친구');
  assert.equal((await register(ownerA, 'ramen_1')).profile_id, a.profile_id);
  await assert.rejects(register(ownerB, 'RAMEN_1'), /ID_TAKEN/);
  await assert.rejects(register(ownerA, '<script>'), /INVALID_NAME/);
  await assert.rejects(save(ownerB, a.profile_id, runA, 100, 6000, true), /PLAYER_NOT_OWNED/);
});
test('retries, stale updates and reused run IDs cannot double time or overwrite finished results', async () => {
  let data = await save(ownerA, a.profile_id, runA, 100, 10000, false);
  assert.equal(data.total_play_ms, 10000); assert.equal(data.best_score, 0);
  data = await save(ownerA, a.profile_id, runA, 100, 10000, false); assert.equal(data.total_play_ms, 10000);
  data = await save(ownerA, a.profile_id, runA, 120, 20000, true);
  assert.equal(data.total_play_ms, 20000); assert.equal(data.best_score, 120);
  data = await save(ownerA, a.profile_id, runA, 1000, 30000, false);
  assert.equal(data.total_play_ms, 20000); assert.equal(data.best_score, 120); assert.equal(data.run_finished, true);
  await assert.rejects(save(ownerB, b.profile_id, runA, 500, 5000, true), /RUN_NOT_OWNED/);
  data = await save(ownerA, a.profile_id, '20000000-0000-4000-8000-000000000002', 80, 6000, true);
  assert.equal(data.best_score, 120); assert.equal(data.total_play_ms, 26000);
  await assert.rejects(save(ownerA, a.profile_id, '20000000-0000-4000-8000-000000000003', 99999, 6000, true), /INVALID_RUN/);
});
test('public score and time leaderboards use different orderings and expose no ownership data', async () => {
  await save(ownerB, b.profile_id, '20000000-0000-4000-8000-000000000004', 220, 7000, true);
  await db.exec('set role anon;');
  try {
    const scores = (await db.query("select * from public.kkuri_leaderboard('score')")).rows;
    const times = (await db.query("select * from public.kkuri_leaderboard('time')")).rows;
    assert.equal(scores[0].display_name, '토끼친구'); assert.equal(times[0].display_name, 'Ramen_1');
    assert.deepEqual(Object.keys(scores[0]), ['rank', 'display_name', 'best_score', 'total_play_ms']);
    await assert.rejects(db.query('select * from public.kkuri_profiles'), /permission denied/);
    await assert.rejects(db.query("select public.kkuri_register_player('다른친구')"), /permission denied/);
  } finally { await db.exec('reset role;'); }
  await assert.rejects(asUser(ownerA, "update public.kkuri_profiles set best_score=9000"), /permission denied/);
});
