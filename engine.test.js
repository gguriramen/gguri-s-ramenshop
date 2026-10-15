const {test} = require('node:test');
const assert = require('node:assert/strict');
const RamenGame = require('./engine');
function setup() { const g = new RamenGame(() => 0); g.start(); return g; }
function cook(g, topping = 'egg') { g.add(0, 'water'); g.add(0, 'noodles'); g.add(0, topping); }
test('ingredients require water then noodles and do not reset cooking on duplicate clicks', () => {
  const g = setup(); g.add(0, 'noodles'); assert.equal(g.pots[0].noodles, false);
  g.add(0, 'egg'); assert.equal(g.pots[0].topping, null);
  cook(g); g.tick(4); g.add(0, 'noodles'); assert.equal(g.pots[0].cook, 4);
  g.add(0, 'meat'); assert.equal(g.pots[0].topping, 'egg');
});
test('correct orders at both cooking boundaries score, clear pot, and reward consecutive success', () => {
  const g = setup(); cook(g); g.tick(6); assert.equal(g.serve(0, 0).ok, true);
  assert.equal(g.score, 100); assert.equal(g.served, 1); assert.equal(g.pots[0].water, false);
  cook(g); g.tick(10); assert.equal(g.serve(0, 0).ok, true); assert.equal(g.score, 220);
});
test('undercooked, overcooked, and incorrect toppings fail without fulfilling the order', () => {
  for (const [seconds, topping] of [[5.9, 'egg'], [10.1, 'egg'], [7, 'meat']]) {
    const g = setup(); g.score = 100; cook(g, topping); g.tick(seconds);
    const order = g.orders[0]; assert.equal(g.serve(0, 0).ok, false);
    assert.equal(g.served, 0); assert.equal(g.score, 80); assert.equal(g.orders[0], order);
    assert.equal(g.pots[0].noodles, false);
  }
});
test('waiting customers leave, score stays nonnegative, and new orders arrive', () => {
  const g = setup(); g.combo = 4; const oldOrder = g.orders[0];
  assert.equal(g.tick(30).length, 3); assert.equal(g.combo, 0); assert.equal(g.score, 0);
  assert.notEqual(g.orders[0], oldOrder); assert.equal(g.orders[0].patience, 30);
});
test('all pots cook together, game ends at 90 seconds, and closed shop rejects actions', () => {
  const g = setup(); cook(g); g.add(1, 'water'); g.add(1, 'noodles'); g.tick(7);
  assert.equal(g.pots[1].cook, 7); assert.equal(g.pots[0].cook, 7);
  g.tick(100); assert.equal(g.time, 0); assert.equal(g.active, false);
  assert.equal(g.serve(0, 0).ok, false); g.add(2, 'water'); assert.equal(g.pots[2].water, false);
  g.start(); assert.equal(g.time, 90); assert.equal(g.score, 0); assert.equal(g.pots[0].water, false);
});
