(function (root) {
  'use strict';
  const key = 'kkuri-player-records-v1';
  const avatars = Object.freeze([
    {id: 'natural', name: '포근한 꾸리'},
    {id: 'chef', name: '라멘 사장님'},
    {id: 'raincoat', name: '노란 우비'},
    {id: 'gardener', name: '초록 정원사'},
    {id: 'sailor', name: '바다 나들이'},
    {id: 'hoodie', name: '분홍 후드'}
  ].map(Object.freeze));
  function runId() {
    if (root.crypto?.randomUUID) return root.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (root.crypto?.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  function playerName(value) {
    const name = String(value || '').normalize('NFKC').trim();
    if (!/^[가-힣A-Za-z0-9_]{2,12}$/.test(name)) throw new Error('아이디는 한글·영문·숫자·밑줄로 2~12자 입력해 주세요.');
    return name;
  }
  function duration(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
  }
  class PlayerStore {
    constructor(options = {}) {
      this.storage = options.storage;
      this.fetch = options.fetch || root.fetch?.bind(root);
      this.uuid = options.uuid || runId;
      this.config = options.config || {};
      this.onchange = () => {};
      this.state = {profiles: {}, runs: {}, active: null, session: null};
      this.currentRunId = null;
      this.storageAvailable = Boolean(this.storage);
      try {
        const saved = JSON.parse(this.storage?.getItem(key) || 'null');
        if (saved?.profiles && saved?.runs) this.state = saved;
      } catch { this.storageAvailable = false; }
      this.state.profiles = Object.assign(Object.create(null), this.state.profiles);
      this.state.runs = Object.assign(Object.create(null), this.state.runs);
      // An interrupted business is a completed partial run, not another 90 seconds.
      for (const run of Object.values(this.state.runs)) run.finished = true;
      this.status = this.configured ? 'offline' : 'local';
      this.lastPersistMs = 0; this.lastSyncMs = 0;
      this.persist();
    }
    get configured() { return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(this.config.projectUrl || '') && Boolean(this.config.publishableKey); }
    persist() {
      try { this.storage?.setItem(key, JSON.stringify(this.state)); } catch { this.storageAvailable = false; }
    }
    profile(nameKey = this.state.active) {
      const p = this.state.profiles[nameKey];
      if (!p) return null;
      const runs = Object.values(this.state.runs).filter(r => r.playerKey === nameKey);
      return {name: p.name, avatar: avatars.some(a => a.id === p.avatar) ? p.avatar : 'natural', bestScore: Math.max(p.bestScore || 0, ...runs.filter(r => r.finished).map(r => r.score)), playMs: (p.serverPlayMs || 0) + runs.reduce((sum, r) => sum + Math.max(0, r.playMs - (r.syncedPlayMs || 0)), 0)};
    }
    selectAvatar(id) {
      if (!avatars.some(a => a.id === id)) throw new Error('선택할 수 없는 꾸리예요.');
      const profile = this.state.profiles[this.state.active];
      if (!profile) return false;
      profile.avatar = id;
      this.persist(); this.onchange();
      return true;
    }
    async selectPlayer(value) {
      const name = playerName(value), nameKey = name.toLowerCase();
      if (!this.state.profiles[nameKey]) this.state.profiles[nameKey] = {name, bestScore: 0, serverPlayMs: 0};
      if (this.configured) {
        try { await this.register(nameKey); this.status = 'online'; }
        catch (error) {
          if (error.message === 'ID_TAKEN') throw new Error('이미 사용하는 아이디예요. 다른 아이디를 입력해 주세요.');
          if (!this.state.profiles[nameKey].remoteId) throw new Error('아이디를 등록하지 못했어요. 연결을 확인하고 다시 시작해 주세요.');
          this.status = 'offline';
        }
      }
      this.state.active = nameKey; this.persist(); this.onchange();
      void this.sync();
      return this.profile();
    }
    beginRun() {
      if (!this.profile()) return;
      const previous = this.state.runs[this.currentRunId];
      if (previous) this.finishRun(previous.score);
      const id = this.uuid();
      this.state.runs[id] = {id, playerKey: this.state.active, score: 0, playMs: 0, syncedPlayMs: 0, finished: false};
      this.currentRunId = id; this.lastPersistMs = 0; this.lastSyncMs = 0;
      this.persist();
    }
    advanceRun(score, ms) {
      const run = this.state.runs[this.currentRunId];
      if (!run || run.finished) return;
      run.score = Math.max(0, Math.min(9000, Math.round(score)));
      run.playMs = Math.min(90000, run.playMs + Math.max(0, ms));
      if (run.playMs - this.lastPersistMs >= 1000) { this.lastPersistMs = run.playMs; this.persist(); this.onchange(); }
      if (run.playMs - this.lastSyncMs >= 10000) { this.lastSyncMs = run.playMs; void this.sync(); }
    }
    finishRun(score) {
      const run = this.state.runs[this.currentRunId];
      if (!run) return;
      this.advanceRun(score, 0); run.finished = true; this.currentRunId = null;
      if (run.playMs === 0 && run.score === 0) delete this.state.runs[run.id];
      this.persist(); this.onchange(); void this.sync();
    }
    async request(path, body, token, keepalive = false) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000);
      try {
        const headers = {'Content-Type': 'application/json', apikey: this.config.publishableKey};
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await this.fetch(this.config.projectUrl.replace(/\/$/, '') + path, {method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal, keepalive});
        const data = await response.json();
        if (!response.ok) throw new Error(data.message === 'ID_TAKEN' ? 'ID_TAKEN' : '연결을 확인한 뒤 다시 시도해 주세요.');
        return data;
      } finally { clearTimeout(timer); }
    }
    async auth() {
      const session = this.state.session;
      if (session?.access_token && session.expires_at > Date.now() / 1000 + 60) return session.access_token;
      if (!this.authPromise) this.authPromise = (async () => {
        const data = session?.refresh_token
          ? await this.request('/auth/v1/token?grant_type=refresh_token', {refresh_token: session.refresh_token})
          : await this.request('/auth/v1/signup', {});
        if (!data.access_token || !data.refresh_token) throw new Error('로그인 연결을 확인해 주세요.');
        this.state.session = {access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at || Date.now() / 1000 + data.expires_in};
        this.persist(); return data.access_token;
      })().finally(() => { this.authPromise = null; });
      return this.authPromise;
    }
    async rpc(name, body, keepalive = false) { return this.request(`/rest/v1/rpc/${name}`, body, await this.auth(), keepalive); }
    acceptProfile(nameKey, data) {
      const p = this.state.profiles[nameKey];
      p.remoteId = data.profile_id; p.name = data.display_name;
      p.bestScore = Math.max(p.bestScore || 0, data.best_score || 0);
      p.serverPlayMs = Math.max(p.serverPlayMs || 0, Number(data.total_play_ms) || 0);
    }
    async register(nameKey) {
      const data = await this.rpc('kkuri_register_player', {p_name: this.state.profiles[nameKey].name});
      this.acceptProfile(nameKey, data); return data;
    }
    async sync() {
      if (!this.configured) return false;
      if (this.syncPromise) { this.syncAgain = true; return this.syncPromise; }
      this.syncPromise = (async () => {
        try {
          let saved = false;
          do {
            this.syncAgain = false;
            for (const run of Object.values(this.state.runs)) {
              const p = this.state.profiles[run.playerKey];
              if (!p.remoteId) await this.register(run.playerKey);
              const data = await this.rpc('kkuri_save_run', {p_profile_id: p.remoteId, p_run_id: run.id, p_score: run.score, p_play_ms: Math.floor(run.playMs), p_finished: run.finished}, true);
              saved = true;
              this.acceptProfile(run.playerKey, data);
              run.syncedPlayMs = Math.max(run.syncedPlayMs || 0, data.run_play_ms || 0);
              if (data.run_finished && run.finished) delete this.state.runs[run.id];
              this.persist();
            }
          } while (this.syncAgain);
          if (saved) this.status = 'online';
          this.onchange(); return this.status === 'online';
        } catch { this.status = 'offline'; this.onchange(); return false; }
      })().finally(() => { this.syncPromise = null; });
      return this.syncPromise;
    }
    async leaderboard(sort = 'score') {
      if (!this.configured) return null;
      try {
        const rows = await this.rpc('kkuri_leaderboard', {p_sort: sort === 'time' ? 'time' : 'score'});
        this.status = 'online'; this.onchange(); return rows;
      } catch (error) { this.status = 'offline'; this.onchange(); throw error; }
    }
  }
  const api = {PlayerStore, playerName, duration, avatars};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KkuriSocial = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
