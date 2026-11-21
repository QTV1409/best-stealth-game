// Moonpearl Heist — input: keyboard, mouse and touch. Movement is queued
// one tile at a time; holding a direction walks every tick, holding Shift
// sneaks. Clicking a floor tile walks the thief there by the shortest
// path; the on-screen buttons cover the same actions for mouse and touch.
(function (root) {
  'use strict';

  var KEY_DIRS = {
    KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 },
    KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 },
    KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 },
    KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  };

  // Shortest walkable path between two tiles (walls block), as a list of
  // {dx, dy} steps. Guards are ignored: the player still has to time it.
  function findPath(level, sx, sy, tx, ty) {
    if (!level.walkable(tx, ty)) return null;
    var key = function (x, y) { return x + ',' + y; };
    var prev = {}, seen = {};
    var queue = [{ x: sx, y: sy }];
    seen[key(sx, sy)] = true;
    var head = 0;
    while (head < queue.length) {
      var c = queue[head++];
      if (c.x === tx && c.y === ty) break;
      var dirs = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
      for (var i = 0; i < dirs.length; i++) {
        var nx = c.x + dirs[i].x, ny = c.y + dirs[i].y;
        if (!level.walkable(nx, ny) || seen[key(nx, ny)]) continue;
        seen[key(nx, ny)] = true;
        prev[key(nx, ny)] = { x: c.x, y: c.y, dx: dirs[i].x, dy: dirs[i].y };
        queue.push({ x: nx, y: ny });
      }
    }
    if (!seen[key(tx, ty)]) return null;
    var steps = [], cur = { x: tx, y: ty };
    while (!(cur.x === sx && cur.y === sy)) {
      var p = prev[key(cur.x, cur.y)];
      steps.unshift({ dx: p.dx, dy: p.dy });
      cur = { x: p.x, y: p.y };
    }
    return steps;
  }

  function attachInput(canvas, hooks) {
    var held = {};
    var moveQueue = [];
    var sneakHeld = false;

    function currentDir() {
      var order = ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'];
      for (var i = 0; i < order.length; i++) {
        if (held[order[i]]) return KEY_DIRS[order[i]];
      }
      return null;
    }

    function tileFromEvent(e) {
      var rect = canvas.getBoundingClientRect();
      var cx = e.touches ? e.touches[0].clientX : e.clientX;
      var cy = e.touches ? e.touches[0].clientY : e.clientY;
      var R = root.MoonpearlRender;
      var x = Math.floor(((cx - rect.left) * R.VIEW_W / rect.width - R.OX) / R.TILE);
      var y = Math.floor(((cy - rect.top) * R.VIEW_H / rect.height - R.OY) / R.TILE);
      return { x: x, y: y };
    }

    window.addEventListener('keydown', function (e) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) !== -1) e.preventDefault();
      if (e.repeat) return;
      held[e.code] = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sneakHeld = true;
      if (e.code === 'Space') hooks.onWait();
      if (e.code === 'KeyC') hooks.onCoin();
      if (e.code === 'KeyE') hooks.onTakedown();
      if (e.code === 'KeyP' || e.code === 'Escape') hooks.onPause();
      if (e.code === 'KeyR') hooks.onRestart();
      if (e.code === 'KeyM') hooks.onMute();
      if (e.code === 'Enter') hooks.onStart();
    });
    window.addEventListener('keyup', function (e) {
      held[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') sneakHeld = false;
    });
    window.addEventListener('blur', function () { held = {}; sneakHeld = false; });

    canvas.addEventListener('mousedown', function (e) {
      hooks.onStart();
      var t = tileFromEvent(e);
      var path = findPath(hooks.level(), hooks.playerTile().x, hooks.playerTile().y, t.x, t.y);
      if (path) moveQueue = path;
    });
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault();
      hooks.onStart();
      var t = tileFromEvent(e);
      var path = findPath(hooks.level(), hooks.playerTile().x, hooks.playerTile().y, t.x, t.y);
      if (path) moveQueue = path;
    }, { passive: false });

    return {
      // Called once per tick: returns the move action for this tick, or
      // null when the player is idle. Keyboard wins over the click queue.
      pollMove: function () {
        var dir = currentDir();
        if (dir) {
          moveQueue = [];
          return { dx: dir.x, dy: dir.y, sneak: sneakHeld };
        }
        if (moveQueue.length) {
          var step = moveQueue.shift();
          return { dx: step.dx, dy: step.dy, sneak: sneakHeld };
        }
        return null;
      },
      sneakHeld: function () { return sneakHeld; },
      clearQueue: function () { moveQueue = []; },
    };
  }

  var api = { attachInput: attachInput, findPath: findPath };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonpearlInput = api;
})(typeof window !== 'undefined' ? window : globalThis);
