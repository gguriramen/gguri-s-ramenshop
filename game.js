'use strict';
const game = new RamenGame();
const $ = id => document.getElementById(id);
const toppingLabels = {egg: '달걀', green: '파', meat: '차슈'};
const friendNames = ['토끼 친구', '고양이 친구', '강아지 친구'];
let selectedPot = 0, selectedOrder = 0, lastTime = performance.now(), dialogMode = 'start', paused = true;
let lastRenderTime = 0;

// Cards are already in HTML, so file previews can display them without scripts.
for (let i = 0; i < 3; i++) {
  const customer = $('customers').children[i];
  customer.addEventListener('click', () => { selectedOrder = i; render(); });
  const potButton = $('pots').children[i].querySelector('button');
  potButton.addEventListener('click', () => { selectedPot = i; render(); });
}
function tell(message, type = '') {
  $('message').textContent = message; $('message').className = `message ${type}`;
  $('served-dish').hidden = type !== 'success';
}
function render() {
  $('time').innerHTML = `${Math.ceil(game.time)}<small>초</small>`;
  $('time').className = game.time <= 15 ? 'urgent' : '';
  $('score').innerHTML = `${game.score.toLocaleString()}<small>점</small>`;
  $('served').innerHTML = `${game.served}<small>명</small>`;
  $('combo').textContent = game.combo >= 2 ? `${game.combo}연속 성공!` : '';
  $('serving-target').textContent = `냄비 ${selectedPot + 1} → 손님 ${selectedOrder + 1} · ${toppingLabels[game.orders[selectedOrder].topping]} 라멘`;
  [...$('customers').children].forEach((el, i) => {
    const o = game.orders[i];
    el.classList.toggle('selected', selectedOrder === i);
    el.setAttribute('aria-pressed', String(selectedOrder === i));
    el.setAttribute('aria-label', `손님 ${i + 1}, ${friendNames[i]}, ${toppingLabels[o.topping]} 라멘, 대기 시간 ${Math.ceil(o.patience)}초`);
    el.querySelector('.order-name').innerHTML = `<span class="sprite ${o.topping}" aria-hidden="true"></span> ${toppingLabels[o.topping]} 라멘`;
    el.querySelector('.patience i').style.width = `${o.patience / 30 * 100}%`;
    el.querySelector('.patience i').classList.toggle('low', o.patience < 10);
  });
  [...$('pots').children].forEach((el, i) => {
    const p = game.pots[i], ready = p.noodles && p.cook >= 6 && p.cook <= 10, burnt = p.cook > 10;
    el.className = `pot-card ${i === selectedPot ? 'selected' : ''} ${p.water ? 'water' : ''} ${p.noodles ? 'noodles' : ''} ${ready ? 'ready' : ''} ${burnt ? 'burnt' : ''}`;
    el.querySelector('button').setAttribute('aria-pressed', String(i === selectedPot));
    el.querySelector('.pot-food').className = `pot-food${p.topping ? ` sprite ${p.topping}` : ''}`;
    el.querySelector('.pot-status').textContent = burnt ? '너무 불었어요! 비워 주세요' : ready ? `지금 내주세요! ${p.cook.toFixed(1)}초` : p.noodles ? `보글보글… ${p.cook.toFixed(1)}초` : p.water ? '면을 넣어 주세요' : '물부터 넣어 주세요';
    el.querySelector('.cook-meter i').style.left = `${Math.min(p.cook / 14, 1) * 100}%`;
  });
  document.querySelectorAll('[data-ingredient], #serve, #clear').forEach(el => { el.disabled = !game.active || paused; });
}
function start() {
  game.start(); selectedPot = 0; selectedOrder = 0; paused = false; lastTime = performance.now();
  document.body.classList.add('playing');
  $('dialog').close(); tell('영업 시작! 손님 주문에 맞춰 물 → 면 → 토핑을 넣어 주세요.'); render();
}
function showDialog(mode) {
  dialogMode = mode; paused = true;
  if (mode === 'result') document.body.classList.remove('playing');
  $('dialog-title').innerHTML = mode === 'result' ? '오늘의 영업 끝!' : mode === 'help' ? '맛있는 라멘 만드는 법' : '어서 오세요,<br>꾸리라멘입니다!';
  $('dialog-description').textContent = mode === 'result' ? `${game.served}명의 손님에게 대접했어요. 오늘의 점수는 ${game.score.toLocaleString()}점!` : '90초 동안 손님에게 맛있는 라멘을 만들어 주세요.';
  $('dialog-action').textContent = mode === 'help' && game.active ? '계속 플레이하기 →' : mode === 'result' ? '한 번 더 영업하기 →' : '영업 시작하기 →';
  if (!$('dialog').open) $('dialog').showModal(); render();
}
function resume() { paused = false; lastTime = performance.now(); $('dialog').close(); render(); }
$('dialog-action').addEventListener('click', () => dialogMode === 'help' && game.active ? resume() : start());
$('dialog').addEventListener('cancel', e => { e.preventDefault(); if (dialogMode === 'help' && game.active) resume(); });
$('help').addEventListener('click', () => showDialog('help'));
$('restart').addEventListener('click', () => showDialog('result'));
document.querySelectorAll('[data-ingredient]').forEach(el => el.addEventListener('click', () => { tell(game.add(selectedPot, el.dataset.ingredient)); render(); }));
$('clear').addEventListener('click', () => { game.clear(selectedPot); tell('냄비를 비웠어요. 다시 만들어 볼까요?'); render(); });
$('serve').addEventListener('click', () => { const result = game.serve(selectedPot, selectedOrder); tell(result.message, result.ok ? 'success' : 'error'); render(); });
document.addEventListener('keydown', e => {
  if (!game.active || paused || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  const ingredients = ['water', 'noodles', 'egg', 'green', 'meat'];
  if (ingredients[Number(e.key) - 1]) { e.preventDefault(); tell(game.add(selectedPot, ingredients[Number(e.key) - 1])); render(); }
  else if (e.key === 'Enter' && !['BUTTON', 'A'].includes(document.activeElement.tagName)) { e.preventDefault(); $('serve').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.active && !paused) showDialog('help'); });
function frame(now) {
  const dt = (now - lastTime) / 1000; lastTime = now;
  if (game.active && !paused) {
    const events = game.tick(dt);
    if (events.length) tell(events[0], 'error');
    // Keep touch interactions responsive without rebuilding the UI every frame.
    if (now - lastRenderTime >= 100) { render(); lastRenderTime = now; }
    if (!game.active) showDialog('result');
  }
  requestAnimationFrame(frame);
}
render(); showDialog('start'); requestAnimationFrame(frame);
document.querySelectorAll('.customer, .pot-select, #help, #restart').forEach(el => { el.disabled = false; });
$('preview-notice').hidden = true;
