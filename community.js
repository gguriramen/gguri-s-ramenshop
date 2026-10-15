'use strict';
let playerStorage;
try { playerStorage = localStorage; } catch { /* File previews may not allow storage. */ }
const playerStore = new KkuriSocial.PlayerStore({storage: playerStorage, config: globalThis.KKURI_SOCIAL_CONFIG});
let communityPaused = true, rankingSort = 'score', rankingRequest = 0, identityBusy = false;
function updateMyProfile() {
  const profile = playerStore.profile();
  $('my-player-name').textContent = profile?.name || '아이디를 입력해 주세요';
  $('my-best-score').textContent = (profile?.bestScore || 0).toLocaleString();
  $('my-play-time').textContent = KkuriSocial.duration(profile?.playMs || 0);
  $('profile-note').textContent = !playerStore.storageAvailable ? '이 브라우저에서는 기록 저장이 제한돼요.' : playerStore.status === 'online' ? '기록이 저장됐어요.' : playerStore.configured ? '기록은 이 기기에 보관 중이에요. 연결되면 다시 저장해요.' : '내 기록은 이 기기에 저장돼요. 전체 랭킹은 연결 준비 중이에요.';
}
playerStore.onchange = updateMyProfile;
function preparePlayerEntry(mode) {
  $('player-entry').hidden = mode !== 'start';
  $('player-entry-error').hidden = true;
  if (mode === 'start') $('player-name').value = playerStore.profile()?.name || '';
}
async function ensurePlayerIdentity() {
  if (dialogMode !== 'start') return true;
  if (identityBusy) return false;
  let name;
  try { name = KkuriSocial.playerName($('player-name').value); }
  catch (error) { showIdentityError(error.message); return false; }
  identityBusy = true;
  $('dialog-action').disabled = true; $('dialog-secondary').disabled = true;
  $('player-entry').setAttribute('aria-busy', 'true');
  try { await playerStore.selectPlayer(name); return true; }
  catch (error) { showIdentityError(error.message); return false; }
  finally {
    identityBusy = false;
    $('dialog-action').disabled = false; $('dialog-secondary').disabled = false;
    $('player-entry').removeAttribute('aria-busy');
  }
}
function showIdentityError(message) {
  $('player-entry-error').textContent = message;
  $('player-entry-error').hidden = false;
  $('player-name').setAttribute('aria-invalid', 'true');
  $('player-name').focus();
}
$('player-name').addEventListener('input', () => { $('player-entry-error').hidden = true; $('player-name').removeAttribute('aria-invalid'); });
$('player-form').addEventListener('submit', event => { event.preventDefault(); $('dialog-action').click(); });
function openCommunity() {
  if ($('dialog').open || $('community-dialog').open) return;
  cancelServingDrag(); cancelIngredientDrag(); hideFeedback();
  communityPaused = paused; paused = true;
  if (tutorialStep === null) playerStore.advanceRun(game.score, 0);
  playerStore.persist(); updateMyProfile();
  $('community-dialog').showModal();
  void refreshRanking();
}
function closeCommunity() {
  $('community-dialog').close();
}
$('community-open').addEventListener('click', openCommunity);
$('community-close').addEventListener('click', closeCommunity);
$('community-dialog').addEventListener('close', () => {
  rankingRequest++;
  paused = communityPaused; lastTime = performance.now();
  if (tutorialStep !== null && !paused) focusTutorialTarget();
});
document.querySelectorAll('[data-ranking-sort]').forEach(button => button.addEventListener('click', () => {
  rankingSort = button.dataset.rankingSort;
  document.querySelectorAll('[data-ranking-sort]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
  void refreshRanking();
}));
$('ranking-refresh').addEventListener('click', () => { void refreshRanking(); });
async function refreshRanking() {
  const request = ++rankingRequest;
  $('ranking-state').textContent = playerStore.configured ? '친구들의 기록을 불러오고 있어요…' : '전체 랭킹은 연결 준비 중이에요.';
  $('ranking-refresh').hidden = !playerStore.configured;
  $('ranking-body').replaceChildren();
  if (!playerStore.configured) return;
  try {
    await playerStore.sync();
    const rows = await playerStore.leaderboard(rankingSort);
    if (request !== rankingRequest || !$('community-dialog').open) return;
    $('ranking-state').textContent = rows.length ? '아이디별 기록 · 상위 100명' : '아직 등록된 영업 기록이 없어요. 첫 기록을 남겨 보세요!';
    const currentName = playerStore.profile()?.name.toLowerCase();
    for (const row of rows) {
      const tr = document.createElement('tr');
      if (row.display_name.toLowerCase() === currentName) { tr.className = 'my-ranking'; tr.setAttribute('aria-label', '내 기록'); }
      for (const text of [row.rank, row.display_name, Number(row.best_score).toLocaleString(), KkuriSocial.duration(Number(row.total_play_ms))]) {
        const cell = document.createElement('td'); cell.textContent = String(text); cell.title = String(text); tr.append(cell);
      }
      $('ranking-body').append(tr);
    }
    updateMyProfile();
  } catch {
    if (request !== rankingRequest || !$('community-dialog').open) return;
    $('ranking-state').textContent = '랭킹을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.';
  }
}
updateMyProfile();
window.addEventListener('pagehide', event => {
  if (!event.persisted && tutorialStep === null) playerStore.finishRun(game.score);
  playerStore.persist();
});
initializeGame();
