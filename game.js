'use strict';
const game = new RamenGame();
const $ = id => document.getElementById(id);
const toppingLabels = {egg: '달걀', green: '파', meat: '차슈'};
const friendNames = ['토끼 친구', '고양이 친구', '강아지 친구'];
const tutorialKey = 'gguri-ramen-tutorial-complete-v1';
const tutorialSteps = [
  {action: 'order', target: '#customers .customer', title: '토끼 친구의 주문을 봐요', text: ''},
  {action: 'pot', target: '#pots .pot-select', title: '첫 번째 냄비를 골라요', text: '반짝이는 1번 냄비를 눌러 주세요. 이 냄비에 첫 라멘을 만들 거예요.'},
  {action: 'water', target: '[data-ingredient="water"]', title: '물을 먼저 부어요', text: '물방울이 있는 물 버튼을 눌러 냄비에 물을 부어 주세요.'},
  {action: 'noodles', target: '[data-ingredient="noodles"]', title: '쫄깃한 면을 넣어요', text: '노란 면 버튼을 눌러 주세요. 물 다음에는 면이에요!'},
  {action: 'topping'},
  {action: 'wait', target: '#pots .cook-meter', title: '초록색 구간을 기다려요', text: '하트가 움직여요! 면을 넣고 6~10초가 초록색 구간이에요. 연습에서는 면이 불지 않아요.'},
  {action: 'serve', target: '#serve', title: '이제 맛있게 내주세요!', text: '하트가 초록색에 도착했어요. 손님에게 내기 버튼을 눌러 주세요.'}
];
let selectedPot = 0, selectedOrder = 0, lastTime = performance.now(), dialogMode = 'start', paused = true;
let lastRenderTime = 0, tutorialStep = null, highlightedTarget = null;
let tutorialCompleted = false;
try { tutorialCompleted = localStorage.getItem(tutorialKey) === 'yes'; } catch { /* File previews may block storage. */ }
const mobileMedia = matchMedia('(max-width: 760px), (max-width: 950px) and (max-height: 500px), (pointer: coarse)');
let mobileServing = mobileMedia.matches, servingDrag = null, suppressPotClickUntil = 0;
let ingredientDrag = null, suppressIngredientClickUntil = 0;
let feedbackTimer = null, mistakeTimer = null, mistakeTarget = null, feedbackKind = null;
document.body.classList.toggle('drag-mode', mobileServing);
const welcomeHero = document.querySelector('#dialog-welcome .hero-grid');
function placeWelcome() {
  document.documentElement.classList.toggle('mobile-board', mobileServing);
  if (mobileServing) $('dialog-welcome').replaceChildren(welcomeHero);
  else {
    document.querySelector('.shopfront').insertBefore(welcomeHero, document.querySelector('.stats'));
    $('dialog-welcome').replaceChildren(welcomeHero.cloneNode(true));
  }
}
placeWelcome();

function tutorialInstruction() {
  let step = tutorialSteps[tutorialStep];
  const topping = game.orders[0].topping, label = toppingLabels[topping];
  if (step.action === 'order') step = {...step, text: `토끼 친구가 ${label} 라멘을 주문했어요. 반짝이는 토끼 친구를 눌러 주세요.`};
  if (step.action === 'topping') step = {action: topping, target: `[data-ingredient="${topping}"]`, title: `주문한 ${label} 토핑을 올려요`, text: `토끼 친구가 고른 ${label} 버튼을 눌러 주세요. 토핑은 하나만 넣어요.`};
  if (!mobileServing) return step;
  const copy = {
    order: `${label} 라멘을 주문한 토끼 친구를 눌러 주세요.`,
    pot: '왼쪽 냄비를 눌러 첫 라멘을 만들어요.',
    water: '물방울을 왼쪽 냄비로 끌어다 놓아요.',
    noodles: '노란 면을 왼쪽 냄비로 끌어다 놓아요.',
    [topping]: `${label} 토핑을 왼쪽 냄비로 끌어다 놓아요.`,
    wait: '초록색은 6~10초! 연습에서는 면이 불지 않아요.',
    serve: '라멘을 누른 채 토끼 친구에게 끌어다 놓아요.'
  };
  return {...step, text: copy[step.action], target: ['pot', 'serve'].includes(step.action) ? '#pots .pot-art' : step.target};
}

function canUse(action) {
  return game.active && !paused && (tutorialStep === null || tutorialInstruction().action === action);
}
// Cards are in HTML so file previews can display them without scripts.
for (let i = 0; i < 3; i++) {
  $('customers').children[i].dataset.dropOrder = i;
  $('customers').children[i].addEventListener('click', () => {
    if (!canUse('order') || (tutorialStep !== null && i !== 0)) return;
    selectedOrder = i; if (tutorialStep !== null) advanceTutorial(); else render();
  });
  $('pots').children[i].querySelector('button').addEventListener('click', () => {
    if (performance.now() < suppressPotClickUntil) return;
    if (!canUse('pot') || (tutorialStep !== null && i !== 0)) return;
    selectedPot = i; if (tutorialStep !== null) advanceTutorial(); else render();
  });
  $('pots').children[i].addEventListener('pointerdown', event => beginServingDrag(event, i));
}
function hideFeedback() {
  clearTimeout(feedbackTimer); clearTimeout(mistakeTimer);
  $('input-feedback').hidden = true;
  feedbackKind = null;
  mistakeTarget?.classList.remove('input-mistake'); mistakeTarget = null;
}
function tell(message, type = '', target = null, points = null) {
  $('message').textContent = message; $('message').className = `message ${type}`;
  $('message').setAttribute('aria-live', type === 'error' || type === 'success' ? 'off' : 'polite');
  $('served-dish').hidden = type !== 'success';
  if (type !== 'error' && type !== 'success') {
    // Let players start the next bowl without immediately losing their reward.
    if (feedbackKind !== 'success') hideFeedback();
    return;
  }
  clearTimeout(feedbackTimer);
  clearTimeout(mistakeTimer); mistakeTarget?.classList.remove('input-mistake'); mistakeTarget = null;
  feedbackKind = type;
  $('input-feedback').classList.toggle('is-success', type === 'success');
  $('input-feedback').setAttribute('role', type === 'success' ? 'status' : 'alert');
  $('input-feedback').setAttribute('aria-live', type === 'success' ? 'polite' : 'assertive');
  const hasPoints = Number.isFinite(points) && points !== 0;
  $('feedback-score').hidden = !hasPoints;
  $('feedback-score').textContent = hasPoints ? `${points > 0 ? '+' : '−'}${Math.abs(points)}점` : '';
  $('feedback-score').classList.toggle('is-gain', hasPoints && points > 0);
  // Put the score in its own badge and keep the explanation short enough for phones.
  $('feedback-text').textContent = hasPoints ? message.replace(/\s*[+−-]\d+점\s*(?:·\s*)?/, ' ').replace(' 다음 그릇은 잘할 수 있어요.', '').trim() : message;
  $('input-feedback').style.top = $('tutorial-panel').hidden ? 'max(12px, env(safe-area-inset-top, 0px))' : `${$('tutorial-panel').getBoundingClientRect().bottom + 8}px`;
  $('input-feedback').hidden = false;
  feedbackTimer = setTimeout(hideFeedback, type === 'success' ? 4000 : 5500);
  if (target && type === 'error') {
    clearTimeout(mistakeTimer); mistakeTarget?.classList.remove('input-mistake');
    mistakeTarget = target;
    // Restart the short cue even if the same control is pressed repeatedly.
    target.classList.remove('input-mistake'); void target.offsetWidth;
    target.classList.add('input-mistake');
    mistakeTimer = setTimeout(() => { mistakeTarget?.classList.remove('input-mistake'); mistakeTarget = null; }, 700);
  }
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
  });
  [...$('pots').children].forEach((el, i) => {
    const p = game.pots[i], ready = p.noodles && p.cook >= 6 && p.cook <= 10, burnt = p.cook > 10;
    el.className = `pot-card ${i === selectedPot ? 'selected' : ''} ${p.water ? 'water' : ''} ${p.noodles ? 'noodles' : ''} ${ready ? 'ready' : ''} ${burnt ? 'burnt' : ''} ${ingredientDrag?.potIndex === i ? 'ingredient-hover' : ''}`;
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
  cancelIngredientDrag();
  hideFeedback();
  tutorialStep = null; document.body.classList.remove('tutorial'); $('tutorial-panel').hidden = true;
  if (highlightedTarget) { highlightedTarget.classList.remove('tutorial-target'); highlightedTarget.removeAttribute('aria-describedby'); }
  highlightedTarget = null;
  document.body.style.removeProperty('--customer-top');
}
function start() {
  playerStore.finishRun(game.score);
  stopTutorial(); suppressPotClickUntil = 0; game.start(); selectedPot = 0; selectedOrder = 0; paused = false; lastTime = performance.now();
  playerStore.beginRun();
  document.body.classList.add('playing'); $('dialog').close();
  tell('영업 시작! 손님 주문에 맞춰 물 → 면 → 토핑을 넣어 주세요.'); render();
}
function focusTutorialTarget() {
  const target = document.querySelector(tutorialInstruction().target);
  // The cooking meter is not interactive, so focus its pot instead.
  const focusable = target.matches('button') ? target : target.closest('.pot-card').querySelector('button');
  if (!focusable.disabled) focusable.focus({preventScroll: true});
  if (mobileServing) return;
  target.scrollIntoView({block: 'center', behavior: 'auto'});
}
function updateTutorial() {
  if (highlightedTarget) { highlightedTarget.classList.remove('tutorial-target'); highlightedTarget.removeAttribute('aria-describedby'); }
  const step = tutorialInstruction();
  $('tutorial-progress').textContent = mobileServing ? `${tutorialStep + 1} / ${tutorialSteps.length}` : `꾸리와 첫 라멘 · ${tutorialStep + 1} / ${tutorialSteps.length}`;
  $('tutorial-title').textContent = step.title; $('tutorial-text').textContent = step.text;
  highlightedTarget = document.querySelector(step.target);
  highlightedTarget.classList.add('tutorial-target'); highlightedTarget.setAttribute('aria-describedby', 'tutorial-text');
  render();
  document.body.style.setProperty('--customer-top', `${$('tutorial-panel').getBoundingClientRect().bottom + 6}px`);
  focusTutorialTarget();
}
function advanceTutorial() { tutorialStep++; updateTutorial(); }
function startTutorial() {
  playerStore.finishRun(game.score);
  stopTutorial(); suppressPotClickUntil = 0; game.start();
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
  cancelIngredientDrag();
  hideFeedback();
  dialogMode = mode; paused = true;
  if (mode === 'result') playerStore.finishRun(game.score);
  preparePlayerEntry(mode);
  const firstVisit = mode === 'start' && !tutorialCompleted;
  const practiceHelp = mode === 'help' && tutorialStep !== null;
  $('dialog').classList.toggle('is-start', mode === 'start');
  $('dialog').classList.toggle('is-first-visit', firstVisit);
  $('dialog').classList.toggle('is-result', mode === 'result');
  $('dialog').classList.toggle('is-tutorial-complete', mode === 'tutorial-complete');
  $('result-summary').hidden = mode !== 'result';
  if (mode === 'result') {
    $('result-score').textContent = game.score.toLocaleString();
    $('result-served').textContent = `${game.served}명`;
  }
  if (mode === 'result') document.body.classList.remove('playing');
  $('dialog-title').innerHTML = mode === 'tutorial-complete' ? '첫 라멘 완성!<br>정말 잘했어요!' : mode === 'result' ? '오늘의 영업 끝!' : mode === 'help' ? '맛있는 라멘 만드는 법' : firstVisit ? '꾸리와 첫 라멘을 <br>만들어 볼까요?' : mobileServing ? '오늘도 영업 시작!' : '어서 오세요,<br>꾸리라멘입니다!';
  $('dialog-description').textContent = mode === 'tutorial-complete' ? '이제 혼자서도 만들 수 있어요. 새 영업은 90초, 0점부터 시작해요!' : mode === 'result' ? `${game.served}명의 손님에게 대접했어요. 오늘의 점수는 ${game.score.toLocaleString()}점!` : firstVisit ? '시간 걱정 없이, 재료 넣기부터 서빙까지 함께 연습해요.' : practiceHelp ? '연습을 이어가거나, 바로 영업을 시작할 수 있어요.' : '90초 동안 손님에게 맛있는 라멘을 만들어 주세요.';
  $('dialog-action').textContent = mode === 'tutorial-complete' ? '진짜 영업 시작하기 →' : practiceHelp ? '계속 연습하기 →' : mode === 'help' && game.active ? '계속 플레이하기 →' : mode === 'result' ? '한 번 더 영업하기 →' : !tutorialCompleted ? '첫 라멘 연습하기 →' : '영업 시작하기 →';
  $('dialog-secondary').textContent = firstVisit ? '바로 영업하기' : practiceHelp ? '영업 시작하기' : mode === 'tutorial-complete' ? '연습 한 번 더 해보기' : '첫 라멘 연습하기';
  if (!$('dialog').open) $('dialog').showModal(); render();
}
function resume() {
  paused = false; lastTime = performance.now(); $('dialog').close(); render();
  if (tutorialStep !== null) focusTutorialTarget();
}
$('dialog-action').addEventListener('click', async () => {
  if (!await ensurePlayerIdentity()) return;
  if (dialogMode === 'help' && game.active) resume();
  else if (dialogMode === 'start' && !tutorialCompleted) startTutorial();
  else start();
});
$('dialog-secondary').addEventListener('click', async () => {
  if (!await ensurePlayerIdentity()) return;
  if ((dialogMode === 'start' && !tutorialCompleted) || (dialogMode === 'help' && tutorialStep !== null)) start();
  else startTutorial();
});
$('tutorial-skip').addEventListener('click', start);
$('dialog').addEventListener('cancel', e => { e.preventDefault(); if (dialogMode === 'help' && game.active) resume(); });
$('help').addEventListener('click', () => showDialog('help'));
$('restart').addEventListener('click', () => tutorialStep !== null ? startTutorial() : showDialog('result'));
function addIngredient(ingredient, potIndex = selectedPot) {
  if (!canUse(ingredient)) return;
  if (tutorialStep !== null && potIndex !== 0) {
    tell('첫 라멘은 왼쪽 냄비에 넣어 주세요.', 'error'); return;
  }
  selectedPot = potIndex;
  const before = JSON.stringify(game.pots[selectedPot]);
  const message = game.add(selectedPot, ingredient);
  const accepted = before !== JSON.stringify(game.pots[selectedPot]);
  tell(message, accepted ? '' : 'error', document.querySelector(`[data-ingredient="${ingredient}"]`));
  if (tutorialStep !== null && accepted) advanceTutorial(); else render();
}
document.querySelectorAll('[data-ingredient]').forEach(el => {
  el.addEventListener('click', () => {
    if (performance.now() >= suppressIngredientClickUntil) addIngredient(el.dataset.ingredient);
  });
  el.addEventListener('pointerdown', beginIngredientDrag);
  el.addEventListener('dragstart', event => event.preventDefault());
});

function beginIngredientDrag(event) {
  const source = event.currentTarget, ingredient = source.dataset.ingredient;
  if (ingredientDrag || servingDrag || !event.isPrimary || event.button !== 0 || !canUse(ingredient)) return;
  ingredientDrag = {id: event.pointerId, source, ingredient, x: event.clientX, y: event.clientY, moved: false, potIndex: null};
  source.setPointerCapture(event.pointerId);
  // Preserve a tap/keyboard fallback; touch-action suppresses panning for drags.
}
function ingredientPotAt(x, y) {
  const card = document.elementFromPoint(x, y)?.closest('#pots .pot-card');
  return card ? [...$('pots').children].indexOf(card) : null;
}
function moveIngredientDrag(event) {
  if (!ingredientDrag || event.pointerId !== ingredientDrag.id) return;
  if (!ingredientDrag.moved && Math.hypot(event.clientX - ingredientDrag.x, event.clientY - ingredientDrag.y) < 8) return;
  if (!ingredientDrag.moved) {
    ingredientDrag.moved = true;
    const art = ingredientDrag.source.firstElementChild.cloneNode(true);
    art.removeAttribute('id');
    $('drag-ingredient').replaceChildren(art);
    $('drag-ingredient').hidden = false;
    document.body.classList.add('ingredient-drag');
  }
  event.preventDefault();
  $('drag-ingredient').style.left = `${Math.max(0, Math.min(innerWidth - 64, event.clientX - 32))}px`;
  $('drag-ingredient').style.top = `${Math.max(0, event.clientY - 74)}px`;
  ingredientDrag.potIndex = ingredientPotAt(event.clientX, event.clientY);
  [...$('pots').children].forEach((el, i) => el.classList.toggle('ingredient-hover', ingredientDrag.potIndex === i));
}
function cancelIngredientDrag() {
  const previous = ingredientDrag; ingredientDrag = null;
  if (previous?.source.hasPointerCapture(previous.id)) previous.source.releasePointerCapture(previous.id);
  $('drag-ingredient').hidden = true;
  document.body.classList.remove('ingredient-drag');
  document.querySelectorAll('.ingredient-hover').forEach(el => el.classList.remove('ingredient-hover'));
}
function endIngredientDrag(event) {
  if (!ingredientDrag || event.pointerId !== ingredientDrag.id) return;
  const {ingredient, moved} = ingredientDrag;
  const potIndex = ingredientPotAt(event.clientX, event.clientY);
  if (moved) { event.preventDefault(); suppressIngredientClickUntil = performance.now() + 350; }
  cancelIngredientDrag();
  if (moved && potIndex !== null) addIngredient(ingredient, potIndex);
  else if (moved) tell('재료를 냄비 위에 끌어다 놓아 주세요.', 'error');
}
$('clear').addEventListener('click', () => {
  if (!canUse('clear')) return;
  game.clear(selectedPot); tell('냄비를 비웠어요. 다시 만들어 볼까요?'); render();
});
$('serve').addEventListener('click', () => serveTo(selectedPot, selectedOrder));
function serveTo(potIndex, orderIndex) {
  if (!canUse('serve')) return;
  if (tutorialStep !== null && (potIndex !== 0 || orderIndex !== 0)) {
    tell('첫 라멘은 토끼 친구에게 내주세요. 다시 끌어다 놓아 봐요.', 'error'); return;
  }
  selectedPot = potIndex; selectedOrder = orderIndex;
  const result = game.serve(potIndex, orderIndex); tell(result.message, result.ok ? 'success' : 'error', $('pots').children[potIndex].querySelector('button'), result.points);
  if (tutorialStep === null) playerStore.advanceRun(game.score, 0);
  if (tutorialStep !== null && result.ok) finishTutorial(); else render();
}

// Pointer events handle both phone touch and narrow-screen mouse dragging.
// The whole pot card owns a prepared-bowl gesture on the fixed mobile board.
function beginServingDrag(event, potIndex) {
  const pot = game.pots[potIndex];
  if (!mobileServing || servingDrag || ingredientDrag || !event.isPrimary || event.button !== 0 || !canUse('serve') || !pot.noodles || !pot.topping || (tutorialStep !== null && potIndex !== 0)) return;
  servingDrag = {id: event.pointerId, potIndex, source: event.currentTarget, x: event.clientX, y: event.clientY, moved: false, orderIndex: null};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();
  selectedPot = potIndex;
  document.documentElement.classList.add('holding-ramen');
  render();
}
function moveServingDrag(event) {
  if (!servingDrag || event.pointerId !== servingDrag.id) return;
  if (!servingDrag.moved && Math.hypot(event.clientX - servingDrag.x, event.clientY - servingDrag.y) < 8) return;
  if (!servingDrag.moved) {
    servingDrag.moved = true; selectedPot = servingDrag.potIndex;
    document.body.classList.add('serving-drag');
    $('drag-bowl').hidden = false;
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
  $('drag-bowl').hidden = true;
  document.documentElement.classList.remove('holding-ramen');
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
  else if (moved) tell('손님에게 끌어다 놓아 주세요. 라멘은 냄비에 그대로 있어요.', 'error', $('pots').children[potIndex].querySelector('button'));
}
document.addEventListener('pointermove', moveServingDrag, {passive: false});
document.addEventListener('pointermove', moveIngredientDrag, {passive: false});
// Safari also needs a non-passive touch handler to suppress native page panning.
document.addEventListener('touchmove', event => {
  if ((servingDrag || ingredientDrag) && event.cancelable) event.preventDefault();
}, {passive: false});
document.addEventListener('pointerup', endServingDrag);
document.addEventListener('pointerup', endIngredientDrag);
document.addEventListener('pointercancel', event => { if (event.pointerId === servingDrag?.id) cancelServingDrag(); });
document.addEventListener('lostpointercapture', event => { if (event.pointerId === servingDrag?.id) cancelServingDrag(); });
document.addEventListener('pointercancel', event => { if (event.pointerId === ingredientDrag?.id) cancelIngredientDrag(); });
document.addEventListener('lostpointercapture', event => { if (event.pointerId === ingredientDrag?.id) cancelIngredientDrag(); });
mobileMedia.addEventListener('change', () => {
  cancelServingDrag(); cancelIngredientDrag(); mobileServing = mobileMedia.matches; document.body.classList.toggle('drag-mode', mobileServing);
  placeWelcome();
  if (tutorialStep !== null && !paused) updateTutorial(); else render();
});
document.addEventListener('keydown', e => {
  if (!game.active || paused || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  const ingredients = ['water', 'noodles', 'egg', 'green', 'meat'];
  if (ingredients[Number(e.key) - 1]) { e.preventDefault(); addIngredient(ingredients[Number(e.key) - 1]); }
  else if (e.key === 'Enter' && !['BUTTON', 'A'].includes(document.activeElement.tagName)) { e.preventDefault(); $('serve').click(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.active && !paused) showDialog('help');
  if (!document.hidden) lastTime = performance.now();
});
function frame(now) {
  const dt = (now - lastTime) / 1000; lastTime = now;
  if (game.active && !paused && !document.hidden) {
    if (tutorialStep === null) {
      const playMs = Math.max(0, Math.min(dt, game.time)) * 1000;
      const events = game.tick(dt);
      playerStore.advanceRun(game.score, playMs);
      if (events.length) tell(events.length > 1 ? `손님 ${events.length}명이 떠났어요. 다음 주문을 준비해요!` : events[0], 'error', null, -30 * events.length);
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
function initializeGame() {
  render(); showDialog('start'); requestAnimationFrame(frame);
  document.querySelectorAll('#help, #restart, #community-open').forEach(el => { el.disabled = false; });
  $('preview-notice').hidden = true;
}
