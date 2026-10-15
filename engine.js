(function (root) {
  'use strict';
  const toppings = ['egg', 'green', 'meat'];
  class RamenGame {
    constructor(random = Math.random) { this.random = random; this.reset(); }
    reset() {
      this.time = 90; this.score = 0; this.served = 0; this.combo = 0;
      this.active = false; this.pots = Array.from({length: 3}, () => this.emptyPot());
      this.orders = Array.from({length: 3}, () => this.newOrder());
    }
    emptyPot() { return {water: false, noodles: false, topping: null, cook: 0}; }
    newOrder() { return {topping: toppings[Math.floor(this.random() * toppings.length)], patience: 30}; }
    start() { this.reset(); this.active = true; }
    tick(seconds) {
      if (!this.active || seconds <= 0) return [];
      const dt = Math.min(seconds, this.time);
      this.time = Math.max(0, this.time - dt);
      this.pots.forEach(p => { if (p.noodles) p.cook += dt; });
      const events = [];
      this.orders.forEach((o, i) => {
        o.patience -= dt;
        if (o.patience <= 0) {
          this.combo = 0; this.score = Math.max(0, this.score - 30);
          this.orders[i] = this.newOrder(); events.push('손님이 떠났어요. 다음 주문을 준비해요!');
        }
      });
      if (this.time === 0) this.active = false;
      return events;
    }
    add(index, ingredient) {
      if (!this.active) return '먼저 영업을 시작해 주세요.';
      const p = this.pots[index];
      if (!p) return '냄비를 선택해 주세요.';
      if (ingredient === 'water') {
        if (p.water) return '이미 물이 있어요.';
        p.water = true; return '물을 부었어요. 이제 면을 넣어요!';
      }
      if (ingredient === 'noodles') {
        if (!p.water) return '물을 먼저 넣어 주세요!';
        if (p.noodles) return '면은 한 번만 넣어요.';
        p.noodles = true; return '면이 익기 시작했어요. 6~10초에 내면 딱 좋아요!';
      }
      if (toppings.includes(ingredient)) {
        if (!p.noodles) return '물과 면을 먼저 넣어 주세요!';
        if (p.topping) return '토핑은 하나만 넣을 수 있어요. 잘못 넣었다면 비워 주세요.';
        p.topping = ingredient; return '토핑을 넣었어요! 초록 구간에 손님에게 내주세요.';
      }
      return '재료를 선택해 주세요.';
    }
    clear(index) {
      if (!this.active || !this.pots[index]) return;
      this.pots[index] = this.emptyPot(); this.combo = 0;
    }
    serve(potIndex, orderIndex) {
      if (!this.active) return {ok: false, message: '영업 중에만 낼 수 있어요.'};
      const p = this.pots[potIndex], order = this.orders[orderIndex];
      if (!p || !order) return {ok: false, message: '냄비와 손님을 선택해 주세요.'};
      if (!p.noodles) return {ok: false, message: '면을 먼저 끓여 주세요!'};
      let reason = '';
      if (p.cook < 6) reason = '아직 덜 익었어요!';
      else if (p.cook > 10) reason = '면이 너무 불었어요!';
      else if (p.topping !== order.topping) reason = '주문과 토핑이 달라요!';
      this.pots[potIndex] = this.emptyPot();
      if (reason) {
        this.combo = 0; this.score = Math.max(0, this.score - 20);
        return {ok: false, message: reason + ' 다음 그릇은 잘할 수 있어요. −20점'};
      }
      this.combo++; this.served++;
      const points = 100 + Math.min(this.combo - 1, 5) * 20;
      this.score += points; this.orders[orderIndex] = this.newOrder();
      return {ok: true, message: `맛있어요! +${points}점 · ${this.combo}연속 성공`};
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = RamenGame;
  else root.RamenGame = RamenGame;
})(typeof globalThis !== 'undefined' ? globalThis : this);
