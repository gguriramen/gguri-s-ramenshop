'use strict';
const game = new RamenGame();
const $ = id => document.getElementById(id);
const toppingLabels = {egg: '달걀', green: '파', meat: '차슈'};
const friendNames = ['토끼 친구', '고양이 친구', '강아지 친구'];
const tutorialKey = 'gguri-ramen-tutorial-complete-v1';
const tutorialSteps = [
  {action: 'order', target: '#customers .customer', title: '토끼 친구의 주문을 봐요', text: '토끼 친구가 달걀 라멘을 주문했어요. 반짝이는 토끼 친구를 눌러 주세요.'},
  {action: 'pot', target: '#pots .pot-select', title: '첫 번째 냄비를 골라요', text: '반짝이는 1번 냄비를 눌러 주세요. 이 냄비에 첫 라멘을 만들 거예요.'},
  {action: 'water', target: '[data-ingredient="water"]', title: '물을 먼저 부어요', text: '물방울이 있는 물 버튼을 눌러 냄비에 물을 부어 주세요.'},
  {action: 'noodles', target: '[data-ingredient="noodles"]', title: '쫄깃한 면을 넣어요', text: '노란 면 버튼을 눌러 주세요. 물 다음에는 면이에요!'},
  {action: 'egg', target: '[data-ingredient="egg"]', title: '주문한 달걀을 올려요', text: '토끼 친구가 고른 반숙 달걀 버튼을 눌러 주세요. 토핑은 하나만 넣어요.'},
  {action: 'wait', target: '#pots .cook-meter', title: '초록색 구간을 기다려요', text: '하트가 움직여요! 면을 넣고 6~10초가 초록색 구간이에요. 연습에서는 면이 불지 않아요.'},
  {action: 'serve', target: '#serve', title: '이제 맛있게 내주세요!', text: '하트가 초록색에 도착했어요. 손님에게 내기 버튼을 눌러 주세요.'}
];
let selectedPot = 0, selectedOrder = 0, lastTime = performance.now(), dialogMode = 'start', paused = true;
let lastRenderTime = 0, tutorialStep = null, highlightedTarget = null;
let tutorialCompleted = false;
try { tutorialCompleted = localStorage.getItem(tutorialKey) === 'yes'; } catch { /* File previews may block storage. */ }
const mobileMedia = matchMedia('(max-width: 760px), (max-width: 950px) and (max-height: 500px), (pointer: coarse)');
let mobileServing = mobileMedia.matches, servingDrag = null, suppressPotClickUntil = 0;
document.body.classList.toggle('drag-mode', mobileServing);

function tutorialInstruction() {
  const step = tutorialSteps[tutorialStep];
  return mobileServing && step.action === 'serve' ? {...step, target: '#pots .pot-art', text: '1번 냄비의 라멘을 누른 채 위쪽 토끼 친구에게 끌어다 놓아 주세요.'} : step;
}

function canUse(action) {
  return game.active && !paused && (tutorialStep === null || tutorialSteps[tutorialStep].action === action);
}
// Cards are in HTML so file previews can display them without scripts.
for (let i = 0; i < 3; i++) {
  $('customers').children[i].dataset.dropOrder = i;
  const dropFriend = $('customers').children[i].cloneNode(true);
  dropFriend.className = 'customer drag-friend'; dropFriend.disabled = false;
  dropFriend.removeAttribute('aria-pressed');
  $('drag-friends').append(dropFriend);
  $('customers').children[i].addEventListener('click', () => {
    if (!canUse('order') || (tutorialStep !== null && i !== 0)) return;
    selectedOrder = i; if (tutorialStep !== null) advanceTutorial(); else render();
  });
  $('pots').children[i].querySelector('button').addEventListener('click', () => {
    if (performance.now() < suppressPotClickUntil) return;
    if (!canUse('pot') || (tutorialStep !== null && i !== 0)) return;
    selectedPot = i; if (tutorialStep !== null) advanceTutorial(); else render();
  });
  $('pots').children[i].querySelector('.pot-art').addEventListener('pointerdown', event => beginServingDrag(event, i));
}
function tell(message, type = '') {
  $('message').textContent = message; $('message').className = `message ${type}`;
  $('served-dish').hidden = type !== 'success';
}
function render() {
  $('time').innerHTML = tutorialStep !== null ? '연습<small>중</small>' : `${Math.ceil(game.time)}<small>초</small>`;
  $('time').className = tutorialStep === null && game.time <= 15 ? 'urgent' : '';
  $('score').innerHTML = `${game.score.toLocaleString()}<small>점</small>`;
  $('served').innerHTML = `${game.served}<small>명</small>`;
  $('combo').textContent = game.combo >= 2 ? `${game.combo}연속 성공!` : '';
  $('serving-target').textContent = `냄비 ${selectedPot + 1} → 손님 ${selectedOrder + 1} · ${toppingLabels[game.orders[selectedOrder].topping]} 라멘`;
  [...$('customers').children].forEach((el, i) => {
    const o = game.orders[i];
    el.classList.toggle('selected', selectedOrder === i);
    el.disabled = !canUse('order') || (tutorialStep !== null && i !== 0);
    el.setAttribute('aria-pressed', String(selectedOrder === i));
    el.setAttribute('aria-label', `손님 ${i + 1}, ${friendNames[i]}, ${toppingLabels[o.topping]} 라멘, 대기 시간 ${Math.ceil(o.patience)}초`);
    el.querySelector('.order-name').innerHTML = `<span class="sprite ${o.topping}" aria-hidden="true"></span> ${toppingLabels[o.topping]} 라멘`;
    el.querySelector('.patience i').style.width = `${o.patience / 30 * 100}%`;
    el.querySelector('.patience i').classList.toggle('low', o.patience < 10);
    const dropFriend = $('drag-friends').children[i];
    dropFriend.querySelector('.order-name').innerHTML = el.querySelector('.order-name').innerHTML;
    dropFriend.setAttribute('aria-label', `${friendNames[i]}에게 ${toppingLabels[o.topping]} 라멘 내기`);
  });
  [...$('pots').children].forEach((el, i) => {
    const p = game.pots[i], ready = p.noodles && p.cook >= 6 && p.cook <= 10, burnt = p.cook > 10;
    el.className = `pot-card ${i === selectedPot ? 'selected' : ''} ${p.water ? 'water' : ''} ${p.noodles ? 'noodles' : ''} ${ready ? 'ready' : ''} ${burnt ? 'burnt' : ''}`;
    const button = el.querySelector('button');
    const draggable = mobileServing && canUse('serve') && p.noodles && p.topping && (tutorialStep === null || i === 0);
    button.disabled = (!canUse('pot') && !draggable) || (tutorialStep !== null && i !== 0);
    el.querySelector('.pot-art').classList.toggle('can-drag', Boolean(draggable));
    button.setAttribute('aria-pressed', String(i === selectedPot));
    el.querySelector('.pot-food').className = `pot-food${p.topping ? ` sprite ${p.topping}` : ''}`;
    el.querySelector('.pot-status').textContent = burnt ? '너무 불었어요! 비워 주세요' : ready ? `지금 내주세요! ${p.cook.toFixed(1)}초` : p.noodles ? `보글보글… ${p.cook.toFixed(1)}초` : p.water ? '면을 넣어 주세요' : '물부터 넣어 주세요';
    el.querySelector('.cook-meter i').style.left = `${Math.min(p.cook / 14, 1) * 100}%`;
  });
  document.querySelectorAll('[data-ingredient]').forEach(el => { el.disabled = !canUse(el.dataset.ingredient); });
  $('serve').disabled = !canUse('serve'); $('clear').disabled = !canUse('clear');
}
function stopTutorial() {
  cancelServingDrag();
  tutorialStep = null; document.body.classList.remove('tutorial'); $('tutorial-panel').hidden = true;
  if (highlightedTarget) { highlightedTarget.classList.remove('tutorial-target'); highlightedTarget.removeAttribute('aria-describedby'); }
  highlightedTarget = null;
}
function start() {
  stopTutorial(); suppressPotClickUntil = 0; game.start(); selectedPot = 0; selectedOrder = 0; paused = false; lastTime = performance.now();
  document.body.classList.add('playing'); $('dialog').close();
  tell('영업 시작! 손님 주문에 맞춰 물 → 면 → 토핑을 넣어 주세요.'); render();
}
function focusTutorialTarget() {
  const target = document.querySelector(tutorialInstruction().target);
  // The cooking meter is not interactive, so focus its pot instead.
  const focusable = target.matches('button') ? target : target.closest('.pot-card').querySelector('button');
  if (!focusable.disabled) focusable.focus({preventScroll: true});
  target.scrollIntoView({block: 'center', behavior: 'auto'});
}
function updateTutorial() {
  if (highlightedTarget) { highlightedTarget.classList.remove('tutorial-target'); highlightedTarget.removeAttribute('aria-describedby'); }
  const step = tutorialInstruction();
  $('tutorial-progress').textContent = `꾸리와 첫 라멘 · ${tutorialStep + 1} / ${tutorialSteps.length}`;
  $('tutorial-title').textContent = step.title; $('tutorial-text').textContent = step.text;
  highlightedTarget = document.querySelector(step.target);
  highlightedTarget.classList.add('tutorial-target'); highlightedTarget.setAttribute('aria-describedby', 'tutorial-text');
  render(); focusTutorialTarget();
}
function advanceTutorial() { tutorialStep++; updateTutorial(); }
function startTutorial() {
  stopTutorial(); suppressPotClickUntil = 0; game.start(); game.orders[0] = {topping: 'egg', patience: 30};
  selectedPot = 0; selectedOrder = 0; paused = false; tutorialStep = 0; lastTime = performance.now();
  document.body.classList.add('playing', 'tutorial'); $('dialog').close(); $('tutorial-panel').hidden = false;
  tell('첫 라멘은 함께 만들어요. 시간 걱정 없이 반짝이는 곳을 눌러 주세요.'); updateTutorial();
}
function finishTutorial() {
  tutorialCompleted = true;
  try { localStorage.setItem(tutorialKey, 'yes'); } catch { /* The tutorial also works without storage. */ }
  stopTutorial(); showDialog('tutorial-complete');
}
function showDialog(mode) {
  cancelServingDrag();
  dialogMode = mode; paused = true;
  $('dialog').classList.toggle('is-result', mode === 'result');
  $('result-summary').hidden = mode !== 'result';
  if (mode === 'result') {
    $('result-score').textContent = game.score.toLocaleString();
    $('result-served').textContent = `${game.served}명`;
  }
  if (mode === 'result') document.body.classList.remove('playing');
  $('dialog-title').innerHTML = mode === 'tutorial-complete' ? '첫 라멘 완성!<br>정말 잘했어요!' : mode === 'result' ? '오늘의 영업 끝!' : mode === 'help' ? '맛있는 라멘 만드는 법' : '어서 오세요,<br>꾸리라멘입니다!';
  $('dialog-description').textContent = mode === 'tutorial-complete' ? '이제 혼자서도 만들 수 있어요. 새 영업은 90초, 0점부터 시작해요!' : mode === 'result' ? `${game.served}명의 손님에게 대접했어요. 오늘의 점수는 ${game.score.toLocaleString()}점!` : mode === 'start' && !tutorialCompleted ? '꾸리와 첫 라멘을 만들어 볼까요? 연습 중에는 시간이 줄거나 손님이 떠나지 않아요.' : '90초 동안 손님에게 맛있는 라멘을 만들어 주세요.';
  $('dialog-action').textContent = mode === 'tutorial-complete' ? '진짜 영업 시작하기 →' : mode === 'help' && game.active ? '계속 플레이하기 →' : mode === 'result' ? '한 번 더 영업하기 →' : !tutorialCompleted ? '첫 라멘 함께 만들기 →' : '영업 시작하기 →';
  $('dialog-secondary').textContent = mode === 'start' && !tutorialCompleted ? '연습 건너뛰고 바로 영업하기' : mode === 'tutorial-complete' ? '연습 한 번 더 해보기' : '첫 라멘 연습하기';
  if (!$('dialog').open) $('dialog').showModal(); render();
}
function resume() {
  paused = false; lastTime = performance.now(); $('dialog').close(); render();
  if (tutorialStep !== null) focusTutorialTarget();
}
$('dialog-action').addEventListener('click', () => {
  if (dialogMode === 'help' && game.active) resume();
  else if (dialogMode === 'start' && !tutorialCompleted) startTutorial();
  else start();
});
$('dialog-secondary').addEventListener('click', () => dialogMode === 'start' && !tutorialCompleted ? start() : startTutorial());
$('tutorial-skip').addEventListener('click', start);
$('dialog').addEventListener('cancel', e => { e.preventDefault(); if (dialogMode === 'help' && game.active) resume(); });
$('help').addEventListener('click', () => showDialog('help'));
$('restart').addEventListener('click', () => tutorialStep !== null ? startTutorial() : showDialog('result'));
function addIngredient(ingredient) {
  if (!canUse(ingredient)) return;
  tell(game.add(selectedPot, ingredient));
  if (tutorialStep !== null) advanceTutorial(); else render();
}
document.querySelectorAll('[data-ingredient]').forEach(el => el.addEventListener('click', () => addIngredient(el.dataset.ingredient)));
$('clear').addEventListener('click', () => {
  if (!canUse('clear')) return;
  game.clear(selectedPot); tell('냄비를 비웠어요. 다시 만들어 볼까요?'); render();
});
$('serve').addEventListener('click', () => serveTo(selectedPot, selectedOrder));
function serveTo(potIndex, orderIndex) {
  if (!canUse('serve')) return;
  if (tutorialStep !== null && (potIndex !== 0 || orderIndex !== 0)) {
    tell('첫 라멘은 토끼 친구에게 내주세요. 다시 끌어다 놓아 봐요.'); return;
  }
  selectedPot = potIndex; selectedOrder = orderIndex;
  const result = game.serve(potIndex, orderIndex); tell(result.message, result.ok ? 'success' : 'error');
  if (tutorialStep !== null && result.ok) finishTutorial(); else render();
}

// Pointer events handle both phone touch and narrow-screen mouse dragging.
// Only prepared pots capture the gesture; the rest of the page still scrolls.
function beginServingDrag(event, potIndex) {
  const pot = game.pots[potIndex];
  if (!mobileServing || servingDrag || !event.isPrimary || event.button !== 0 || !canUse('serve') || !pot.noodles || !pot.topping || (tutorialStep !== null && potIndex !== 0)) return;
  servingDrag = {id: event.pointerId, potIndex, source: event.currentTarget, x: event.clientX, y: event.clientY, moved: false, orderIndex: null};
  event.currentTarget.setPointerCapture(event.pointerId);
}
function moveServingDrag(event) {
  if (!servingDrag || event.pointerId !== servingDrag.id) return;
  if (!servingDrag.moved && Math.hypot(event.clientX - servingDrag.x, event.clientY - servingDrag.y) < 8) return;
  if (!servingDrag.moved) {
    servingDrag.moved = true; selectedPot = servingDrag.potIndex;
    document.body.classList.add('serving-drag');
    $('drag-tray').hidden = false; $('drag-bowl').hidden = false;
    const top = $('tutorial-panel').hidden ? 10 : $('tutorial-panel').getBoundingClientRect().bottom + 8;
    $('drag-tray').style.top = `max(${top}px, env(safe-area-inset-top, 0px))`;
    render();
  }
  event.preventDefault();
  $('drag-bowl').style.left = `${Math.max(0, Math.min(innerWidth - 96, event.clientX - 48))}px`;
  $('drag-bowl').style.top = `${event.clientY - 116}px`;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-order]');
  servingDrag.orderIndex = target ? Number(target.dataset.dropOrder) : null;
  document.querySelectorAll('[data-drop-order]').forEach(el => el.classList.toggle('drop-hover', servingDrag.orderIndex !== null && Number(el.dataset.dropOrder) === servingDrag.orderIndex));
}
function cancelServingDrag() {
  const previous = servingDrag; servingDrag = null;
  if (previous?.source.hasPointerCapture(previous.id)) previous.source.releasePointerCapture(previous.id);
  $('drag-tray').hidden = true; $('drag-bowl').hidden = true;
  document.body.classList.remove('serving-drag');
  document.querySelectorAll('.drop-hover').forEach(el => el.classList.remove('drop-hover'));
}
function endServingDrag(event) {
  if (!servingDrag || event.pointerId !== servingDrag.id) return;
  const {potIndex, moved} = servingDrag;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-order]');
  const orderIndex = target ? Number(target.dataset.dropOrder) : null;
  if (moved) { event.preventDefault(); suppressPotClickUntil = performance.now() + 350; }
  cancelServingDrag();
  if (moved && orderIndex !== null) serveTo(potIndex, orderIndex);
  else if (moved) tell('손님에게 끌어다 놓아 주세요. 라멘은 냄비에 그대로 있어요.');
}
document.addEventListener('pointermove', moveServingDrag, {passive: false});
document.addEventListener('pointerup', endServingDrag);
document.addEventListener('pointercancel', event => { if (event.pointerId === servingDrag?.id) cancelServingDrag(); });
document.addEventListener('lostpointercapture', event => { if (event.pointerId === servingDrag?.id) cancelServingDrag(); });
mobileMedia.addEventListener('change', () => {
  cancelServingDrag(); mobileServing = mobileMedia.matches; document.body.classList.toggle('drag-mode', mobileServing);
  if (tutorialStep !== null && !paused) updateTutorial(); else render();
});
document.addEventListener('keydown', e => {
  if (!game.active || paused || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  const ingredients = ['water', 'noodles', 'egg', 'green', 'meat'];
  if (ingredients[Number(e.key) - 1]) { e.preventDefault(); addIngredient(ingredients[Number(e.key) - 1]); }
  else if (e.key === 'Enter' && !['BUTTON', 'A'].includes(document.activeElement.tagName)) { e.preventDefault(); $('serve').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game.active && !paused) showDialog('help'); });
function frame(now) {
  const dt = (now - lastTime) / 1000; lastTime = now;
  if (game.active && !paused) {
    if (tutorialStep === null) {
      const events = game.tick(dt); if (events.length) tell(events[0], 'error');
    } else if (tutorialSteps[tutorialStep].action === 'wait') {
      // Only the practice pot cooks. The timer and customers stay frozen.
      game.pots[0].cook = Math.min(6.5, game.pots[0].cook + dt);
      if (game.pots[0].cook >= 6) advanceTutorial();
    }
    if (now - lastRenderTime >= 100) { render(); lastRenderTime = now; }
    if (!game.active) showDialog('result');
  }
  requestAnimationFrame(frame);
}
render(); showDialog('start'); requestAnimationFrame(frame);
document.querySelectorAll('#help, #restart').forEach(el => { el.disabled = false; });
$('preview-notice').hidden = true;
