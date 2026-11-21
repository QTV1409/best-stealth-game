// Moonpearl Heist — pure stealth engine (no DOM, no network).
// Tick = 100 ms. The player moves one tile per tick walking (noisy) or one
// tile per two ticks sneaking (silent). Guards patrol fixed waypoints and
// see with a vision cone; detection is a shared 0-100 meter that fills
// gradually, never instantly, so the player can always react.
(function (root) {
  'use strict';

  var TICK_MS = 100;
  var CONE_RANGE = 5; // tiles
  var CONE_COS = 0.70710678; // cos(45deg): the cone half-angle
  var FILL_CLOSE = 12; // per tick, player walking within 2 tiles
  var FILL_FAR = 8; // per tick, player walking farther away
  var FILL_DECAY = 6; // per tick while no guard sees the player
  var SUSPICIOUS_AT = 40;
  var ALERT_AT = 100;
  var WALK_NOISE = 2; // tiles: guards this close hear walking
  var COIN_NOISE = 3; // tiles: guards this close hear a thrown coin
  var TAKEDOWN_NOISE = 2; // tiles: guards this close hear a takedown
  var SUSPICIOUS_LOOK = 15; // ticks a suspicious guard looks around
  var SEARCH_LOOK = 20; // ticks a searching guard looks around
  var ALERT_GIVE_UP = 30; // ticks unseen before an alert guard gives up
  var DIRS = [
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function cheb(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  function euclid(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Bresenham line of sight: true when no wall tile sits between the two
  // tiles (endpoints excluded; the player never stands inside a wall).
  function losClear(level, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy, x = x0, y = y0;
    for (;;) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && level.isWall(x, y)) return false;
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  // Can this guard see the tile (tx, ty) right now? Adjacent tiles are
  // seen except directly behind the guard (the takedown window). Farther
  // tiles need to be inside the 45-degree cone and in line of sight.
  // Bushes hide the player at distance greater than one tile.
  function canSee(level, guard, tx, ty) {
    var dx = tx - guard.x, dy = ty - guard.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d > CONE_RANGE) return false;
    if (level.tileAt(tx, ty) === 'B' && d > 1) return false;
    if (cheb(guard.x, guard.y, tx, ty) <= 1) {
      // Directly behind the guard is the one blind spot up close.
      if (dx === -guard.dirX && dy === -guard.dirY) return false;
      return true;
    }
    var dot = (dx * guard.dirX + dy * guard.dirY) / d;
    if (dot < CONE_COS) return false;
    return losClear(level, guard.x, guard.y, tx, ty);
  }

  // How fast the shared detection meter fills when this guard sees the
  // player: close is faster than far, sneaking halves it, standing in
  // shadow halves it again.
  function fillRate(dist, sneaking, inShadow) {
    var rate = dist <= 2 ? FILL_CLOSE : FILL_FAR;
    if (sneaking) rate /= 2;
    if (inShadow) rate /= 2;
    return rate;
  }

  // --- Guard patrols -------------------------------------------------------
  // A patrol is a list of waypoints the guard walks between, 1 tile per 2
  // ticks, pausing `pause` ticks at each waypoint and spending one arrival
  // tick turning to face the next leg. patrolCycleLength counts it exactly:
  // every leg costs 2 ticks per tile plus 1 arrival tick plus the pause.
  function legTiles(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function patrolCycleLength(guardDef) {
    var wps = guardDef.waypoints, total = 0;
    for (var i = 0; i < wps.length; i++) {
      var a = wps[i], b = wps[(i + 1) % wps.length];
      total += 2 * legTiles(a, b) + 1 + (guardDef.pause || 0);
    }
    return total;
  }

  // The guard's pose (tile + facing) after t ticks of patrolling from the
  // first waypoint. Deterministic and periodic with patrolCycleLength.
  function patrolPoseAt(guardDef, t) {
    var wps = guardDef.waypoints;
    var cycle = patrolCycleLength(guardDef);
    var tt = ((t % cycle) + cycle) % cycle;
    var pause = guardDef.pause || 0;
    var i = 0;
    for (;;) {
      var a = wps[i], b = wps[(i + 1) % wps.length];
      var dist = legTiles(a, b);
      var walkTicks = 2 * dist;
      if (tt < walkTicks) {
        // Mid-leg: one tile every two ticks, facing along the leg.
        var step = Math.floor(tt / 2);
        var sx = Math.sign(b.x - a.x), sy = Math.sign(b.y - a.y);
        var along = step;
        var x = a.x + sx * Math.min(along, Math.abs(b.x - a.x));
        var y = a.y + sy * Math.min(along, Math.abs(b.y - a.y));
        // When walking diagonally in tile steps, move along x first.
        if (sx !== 0 && sy !== 0) {
          var moved = step;
          var xSteps = Math.min(moved, Math.abs(b.x - a.x));
          var ySteps = Math.min(Math.max(0, moved - xSteps), Math.abs(b.y - a.y));
          x = a.x + sx * xSteps; y = a.y + sy * ySteps;
        }
        return { x: x, y: y, dirX: sx, dirY: sy };
      }
      tt -= walkTicks;
      // One arrival tick: the guard has reached the waypoint and turns to
      // face the next leg.
      var nx = wps[(i + 2) % wps.length];
      var dirX = Math.sign(nx.x - b.x), dirY = Math.sign(nx.y - b.y);
      if (tt < 1 + pause) {
        return { x: b.x, y: b.y, dirX: dirX, dirY: dirY };
      }
      tt -= 1 + pause;
      i = (i + 1) % wps.length;
    }
  }

  // --- Game state ----------------------------------------------------------
  function createGame(level) {
    var guards = level.guards.map(function (g, i) {
      var pose = patrolPoseAt(g, 0);
      return {
        id: i, def: g, x: pose.x, y: pose.y, dirX: pose.dirX, dirY: pose.dirY,
        state: 'patrol', targetX: pose.x, targetY: pose.y,
        lookLeft: 0, unseenTicks: 0, moveCounter: 0, down: false,
        legIndex: 0, pauseLeft: 0, arrived: false,
      };
    });
    return {
      level: level, tick: 0,
      player: {
        x: level.start.x, y: level.start.y, dirX: 0, dirY: 1,
        sneakReady: true, coins: level.coins, lives: 3,
      },
      guards: guards, detection: 0, pearlTaken: false,
      won: false, caught: false, over: false,
      lastSeenX: level.start.x, lastSeenY: level.start.y,
      events: [],
    };
  }

  function resetAfterCaught(state) {
    var level = state.level;
    state.player.x = level.start.x; state.player.y = level.start.y;
    state.player.dirX = 0; state.player.dirY = 1; state.player.sneakReady = true;
    state.guards.forEach(function (g, i) {
      var pose = patrolPoseAt(g.def, 0);
      g.x = pose.x; g.y = pose.y; g.dirX = pose.dirX; g.dirY = pose.dirY;
      g.state = 'patrol'; g.lookLeft = 0; g.unseenTicks = 0; g.down = false;
    });
    state.detection = 0; state.caught = false; state.tick = 0;
  }

  // Greedy step toward (tx, ty): try the axis with the larger gap first,
  // then the other; stay put when both are walled. Returns true on move.
  function stepToward(level, guard, tx, ty) {
    var dx = tx - guard.x, dy = ty - guard.y;
    var tries = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      tries = [{ x: Math.sign(dx), y: 0 }, { x: 0, y: Math.sign(dy) }];
    } else {
      tries = [{ x: 0, y: Math.sign(dy) }, { x: Math.sign(dx), y: 0 }];
    }
    for (var i = 0; i < tries.length; i++) {
      var nx = guard.x + tries[i].x, ny = guard.y + tries[i].y;
      if ((tries[i].x !== 0 || tries[i].y !== 0) && level.walkable(nx, ny)) {
        guard.x = nx; guard.y = ny;
        guard.dirX = tries[i].x; guard.dirY = tries[i].y;
        return true;
      }
    }
    return false;
  }

  function guardHearsNoise(state, tx, ty, radius) {
    state.guards.forEach(function (g) {
      if (g.down || g.state === 'alert') return;
      if (cheb(g.x, g.y, tx, ty) <= radius) {
        if (g.state === 'patrol') {
          g.state = 'suspicious';
          g.targetX = tx; g.targetY = ty; g.lookLeft = 0;
          state.events.push({ type: 'heard', guard: g.id, x: tx, y: ty });
        }
      }
    });
  }

  // One tick. action: {dx, dy, sneak, wait, coin, takedown}.
  function stepGame(state, action) {
    var level = state.level, p = state.player;
    state.events = [];
    if (state.won || state.over) return state;
    state.tick++;
    action = action || {};
    var moved = false, walked = false;

    // Patrols run on the clock: a patrolling guard's pose is a pure
    // function of the tick, so the live game and the level checker can
    // never drift apart. Pose them first — detection and noise below
    // must read this tick's poses, not last tick's.
    state.guards.forEach(function (g) {
      if (!g.down && g.state === 'patrol') {
        var pose0 = patrolPoseAt(g.def, state.tick);
        g.x = pose0.x; g.y = pose0.y; g.dirX = pose0.dirX; g.dirY = pose0.dirY;
      }
    });

    // --- Player move ---
    if (action.dx || action.dy) {
      var nx = p.x + action.dx, ny = p.y + action.dy;
      if (level.walkable(nx, ny)) {
        p.dirX = action.dx; p.dirY = action.dy;
        if (action.sneak) {
          if (p.sneakReady) { p.x = nx; p.y = ny; p.sneakReady = false; moved = true; }
          else { p.sneakReady = true; }
        } else {
          p.x = nx; p.y = ny; p.sneakReady = true; moved = true; walked = true;
        }
      }
    } else {
      p.sneakReady = true;
    }

    // --- Coin throw: 3 tiles ahead, guards nearby investigate the landing.
    if (action.coin && p.coins > 0) {
      p.coins--;
      var cx = p.x + p.dirX * 3, cy = p.y + p.dirY * 3;
      cx = Math.max(0, Math.min(level.width - 1, cx));
      cy = Math.max(0, Math.min(level.height - 1, cy));
      state.events.push({ type: 'coin', x: cx, y: cy });
      guardHearsNoise(state, cx, cy, COIN_NOISE);
    }

    // --- Takedown: an adjacent guard that cannot see the player, taken
    // from behind, goes down. A guard that sees the player (or is already
    // alert) turns on the player instead — loudly.
    if (action.takedown) {
      var victim = null;
      state.guards.forEach(function (g) {
        if (!g.down && cheb(g.x, g.y, p.x, p.y) <= 1) victim = g;
      });
      if (victim) {
        if (victim.state === 'alert' || canSee(level, victim, p.x, p.y)) {
          victim.state = 'alert'; victim.unseenTicks = 0;
          state.detection = ALERT_AT;
          state.events.push({ type: 'takedown-failed', guard: victim.id });
        } else {
          victim.down = true;
          state.events.push({ type: 'takedown', guard: victim.id });
          guardHearsNoise(state, victim.x, victim.y, TAKEDOWN_NOISE);
        }
      }
    }

    // --- Walking is noisy: guards close by hear it and investigate.
    if (walked) guardHearsNoise(state, p.x, p.y, WALK_NOISE);

    // --- Detection: the fastest seeing guard sets the fill rate.
    var seenBy = null, bestRate = 0, bestDist = 0;
    var inShadow = level.tileAt(p.x, p.y) === 'S';
    state.guards.forEach(function (g) {
      if (g.down) return;
      if (!canSee(level, g, p.x, p.y)) return;
      var d = euclid(g.x, g.y, p.x, p.y);
      var rate = fillRate(d, !!action.sneak, inShadow);
      if (rate > bestRate) { bestRate = rate; bestDist = d; seenBy = g; }
    });
    if (seenBy) {
      state.detection = Math.min(ALERT_AT, state.detection + bestRate);
      state.lastSeenX = p.x; state.lastSeenY = p.y;
      state.events.push({ type: 'seen', guard: seenBy.id, dist: bestDist });
    } else {
      state.detection = Math.max(0, state.detection - FILL_DECAY);
    }

    // --- Moonpearl pickup ---
    if (!state.pearlTaken && p.x === level.pearl.x && p.y === level.pearl.y) {
      state.pearlTaken = true;
      state.events.push({ type: 'pearl' });
    }

    // --- Guard states and movement ---
    state.guards.forEach(function (g) {
      if (g.down) return;
      var sees = canSee(level, g, p.x, p.y);
      if (state.detection >= ALERT_AT && sees && g.state !== 'alert') {
        g.state = 'alert'; g.unseenTicks = 0;
        state.events.push({ type: 'alert', guard: g.id });
      } else if (state.detection >= SUSPICIOUS_AT && g.state === 'patrol' && sees) {
        g.state = 'suspicious'; g.targetX = state.lastSeenX; g.targetY = state.lastSeenY; g.lookLeft = 0;
        state.events.push({ type: 'suspicious', guard: g.id });
      }
      if (!sees && g.state === 'alert') g.unseenTicks++;

      if (g.state === 'patrol') {
        // Already posed from the clock at the top of this tick.
      } else if (g.state === 'alert') {
        stepToward(level, g, p.x, p.y);
        if (g.unseenTicks >= ALERT_GIVE_UP) {
          g.state = 'search'; g.targetX = state.lastSeenX; g.targetY = state.lastSeenY; g.lookLeft = 0;
        }
      } else if (g.state === 'suspicious' || g.state === 'search') {
        g.moveCounter++;
        if (g.moveCounter % 2 === 0) stepToward(level, g, g.targetX, g.targetY);
        if (g.x === g.targetX && g.y === g.targetY) {
          var look = g.state === 'suspicious' ? SUSPICIOUS_LOOK : SEARCH_LOOK;
          g.lookLeft++;
          if (g.lookLeft >= look) {
            if (g.state === 'suspicious') {
              g.state = 'search'; g.targetX = state.lastSeenX; g.targetY = state.lastSeenY; g.lookLeft = 0;
            } else {
              g.state = 'patrol'; g.lookLeft = 0;
            }
          }
        } else {
          g.lookLeft = 0;
        }
      }
    });

    // --- Caught: an alert guard on the player's tile ends the attempt.
    state.guards.forEach(function (g) {
      if (!g.down && g.state === 'alert' && g.x === p.x && g.y === p.y) {
        state.caught = true;
        state.events.push({ type: 'caught', guard: g.id });
      }
    });
    if (state.caught) {
      p.lives--;
      state.events.push({ type: 'life-lost', lives: p.lives });
      if (p.lives <= 0) { state.over = true; state.events.push({ type: 'game-over' }); }
      else resetAfterCaught(state);
    }

    // --- Win: the pearl in hand and one foot on the exit.
    if (!state.over && state.pearlTaken && p.x === level.exit.x && p.y === level.exit.y) {
      state.won = true;
      state.events.push({ type: 'won' });
    }
    return state;
  }

  // --- Level checker -------------------------------------------------------
  // Time-aware BFS over (tile, tick mod patrol-cycle, detection, sneak
  // readiness, pearl). A path counts only while detection stays under 40
  // (no guard ever turns suspicious) and no walk step lands within noise
  // range of a guard — so the guards never leave patrol and their poses
  // come straight from the patrol table, exactly as the live game runs
  // them. If the checker passes, the level is completable unseen.
  function checkLevel(level) {
    var cycles = level.guards.map(function (g) { return patrolCycleLength(g); });
    var lcm = cycles.reduce(function (a, b) {
      var g = gcd(a, b);
      return (a / g) * b;
    }, 1);
    var checks = [];
    function fail(reason) {
      return { pass: false, reason: reason, cycle: lcm, checks: checks };
    }
    // The start tile must be unseen at t = 0.
    var startSeen = false;
    level.guards.forEach(function (g) {
      var pose = patrolPoseAt(g, 0);
      if (canSee(level, pose, level.start.x, level.start.y)) startSeen = true;
    });
    checks.push({ name: 'start-unseen', pass: !startSeen });
    if (startSeen) return fail('start tile is watched at t=0');
    // Every guard must leave the exit unwatched for part of its cycle.
    var exitWatchedAll = true;
    for (var t = 0; t < lcm; t++) {
      var anySees = false;
      level.guards.forEach(function (g) {
        var pose = patrolPoseAt(g, t);
        if (canSee(level, pose, level.exit.x, level.exit.y)) anySees = true;
      });
      if (!anySees) { exitWatchedAll = false; break; }
    }
    checks.push({ name: 'exit-opens', pass: !exitWatchedAll });
    if (exitWatchedAll) return fail('exit is watched for the whole cycle');
    if (lcm > 480) return fail('patrol-cycle LCM ' + lcm + ' exceeds 480');

    var startKey = key(level.start.x, level.start.y, 0, 0, true, false);
    var queue = [{
      x: level.start.x, y: level.start.y, t: 0, detection: 0,
      sneakReady: true, pearl: false,
    }];
    var visited = {};
    visited[startKey] = true;
    var parent = {};
    parent[startKey] = null;
    var expanded = 0;
    var head = 0;
    var goalKey = null;
    while (head < queue.length) {
      var s = queue[head++];
      expanded++;
      var sKey = key(s.x, s.y, s.t % lcm, s.detection, s.sneakReady, s.pearl);
      if (s.x === level.exit.x && s.y === level.exit.y && s.pearl) {
        goalKey = sKey;
        break;
      }
      var nt = s.t + 1;
      var poses = level.guards.map(function (g) { return patrolPoseAt(g, nt); });
      var actions = [];
      DIRS.forEach(function (d) {
        actions.push({ dx: d.x, dy: d.y, sneak: false });
        actions.push({ dx: d.x, dy: d.y, sneak: true });
      });
      actions.push({ dx: 0, dy: 0, sneak: false, wait: true });
      for (var ai = 0; ai < actions.length; ai++) {
        var a = actions[ai];
        var nx = s.x, ny = s.y, nSneak = s.sneakReady, nPearl = s.pearl;
        var walked = false;
        if (a.dx || a.dy) {
          var tx = s.x + a.dx, ty = s.y + a.dy;
          if (!level.walkable(tx, ty)) continue;
          if (a.sneak) {
            if (!s.sneakReady) continue;
            nx = tx; ny = ty; nSneak = false;
          } else {
            nx = tx; ny = ty; nSneak = true; walked = true;
          }
        } else {
          nSneak = true;
        }
        if (nx === level.pearl.x && ny === level.pearl.y) nPearl = true;
        // Walking within noise range of a guard is heard: reject the step.
        if (walked) {
          var heard = false;
          poses.forEach(function (pose) {
            if (cheb(pose.x, pose.y, nx, ny) <= WALK_NOISE) heard = true;
          });
          if (heard) continue;
        }
        // Detection at the new tick, from the patrol poses. The fill rate
        // is the fastest seeing guard's, never the sum — the live game
        // takes the max too, so the two can never disagree.
        var nd = s.detection;
        var inShadow = level.tileAt(nx, ny) === 'S';
        var seen = false, best = 0;
        poses.forEach(function (pose) {
          if (!canSee(level, pose, nx, ny)) return;
          seen = true;
          var rate = fillRate(euclid(pose.x, pose.y, nx, ny), !!a.sneak, inShadow);
          if (rate > best) best = rate;
        });
        if (seen) nd = Math.min(ALERT_AT, nd + best);
        else nd = Math.max(0, nd - FILL_DECAY);
        if (nd >= SUSPICIOUS_AT) continue;
        var nKey = key(nx, ny, nt % lcm, nd, nSneak, nPearl);
        if (visited[nKey]) continue;
        visited[nKey] = true;
        parent[nKey] = { prev: sKey, action: a };
        queue.push({ x: nx, y: ny, t: nt, detection: nd, sneakReady: nSneak, pearl: nPearl });
      }
    }
    if (!goalKey) return fail('no unseen path from start to pearl to exit');
    // Reconstruct the action list.
    var actionsOut = [];
    var k = goalKey;
    while (parent[k]) {
      actionsOut.unshift(parent[k].action);
      k = parent[k].prev;
    }
    // Peak detection along the path (recomputed by replay).
    var replay = simulateRun(level, actionsOut);
    checks.push({ name: 'path-found', pass: true });
    return {
      pass: true, reason: '', cycle: lcm, checks: checks,
      ticks: actionsOut.length, path: actionsOut,
      maxDetection: replay.maxDetection, seenTicks: replay.seenTicks,
      expanded: expanded,
    };
  }

  function key(x, y, tMod, detection, sneakReady, pearl) {
    return x + ',' + y + ',' + tMod + ',' + detection + ',' + (sneakReady ? 1 : 0) + ',' + (pearl ? 1 : 0);
  }

  function gcd(a, b) {
    while (b) { var t = b; b = a % b; a = t; }
    return a;
  }

  // Replay an action list through the live engine and report the outcome.
  function simulateRun(level, actions) {
    var state = createGame(level);
    var maxDetection = 0, seenTicks = 0;
    for (var i = 0; i < actions.length; i++) {
      stepGame(state, actions[i]);
      if (state.detection > maxDetection) maxDetection = state.detection;
      var seen = false;
      state.events.forEach(function (e) { if (e.type === 'seen') seen = true; });
      if (seen) seenTicks++;
      if (state.won || state.over) break;
    }
    return {
      outcome: state.won ? 'won' : (state.over ? 'game-over' : (state.caught ? 'caught' : 'playing')),
      ticks: state.tick, maxDetection: maxDetection, seenTicks: seenTicks,
      pearlTaken: state.pearlTaken, lives: state.player.lives,
    };
  }

  var api = {
    TICK_MS: TICK_MS, CONE_RANGE: CONE_RANGE,
    SUSPICIOUS_AT: SUSPICIOUS_AT, ALERT_AT: ALERT_AT,
    WALK_NOISE: WALK_NOISE, COIN_NOISE: COIN_NOISE,
    mulberry32: mulberry32, cheb: cheb, euclid: euclid,
    losClear: losClear, canSee: canSee, fillRate: fillRate,
    patrolCycleLength: patrolCycleLength, patrolPoseAt: patrolPoseAt,
    createGame: createGame, stepGame: stepGame, resetAfterCaught: resetAfterCaught,
    checkLevel: checkLevel, simulateRun: simulateRun,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonpearlEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
