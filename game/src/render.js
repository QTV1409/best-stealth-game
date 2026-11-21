// Moonpearl Heist — canvas rendering. Every guard's vision cone is drawn
// tile by tile from the same canSee test the engine uses, so the floor
// shows exactly what the guards can see: amber while patrolling, orange
// while suspicious, red while alert.
(function (root) {
  'use strict';

  var TILE = 48;
  var VIEW_W = 1280, VIEW_H = 800;
  var OX = 64, OY = 88; // playfield offset (HUD sits above it)
  var HUD_H = 72;

  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) ^ 0x5bf03635;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function tileCenter(x, y) {
    return { x: OX + x * TILE + TILE / 2, y: OY + y * TILE + TILE / 2 };
  }

  function drawFloor(ctx, level) {
    for (var y = 0; y < level.height; y++) {
      for (var x = 0; x < level.width; x++) {
        var px = OX + x * TILE, py = OY + y * TILE;
        var t = level.tileAt(x, y);
        if (t === '#') continue;
        var v = hash(x, y);
        ctx.fillStyle = v < 0.5 ? '#212b42' : '#242f47';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = 'rgba(120,140,180,0.07)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        if (t === 'S') {
          ctx.fillStyle = 'rgba(6,8,20,0.55)';
          ctx.fillRect(px, py, TILE, TILE);
        }
        if (t === 'B') {
          ctx.fillStyle = '#234a2c';
          ctx.beginPath();
          ctx.arc(px + 14, py + 16, 11, 0, Math.PI * 2);
          ctx.arc(px + 32, py + 13, 12, 0, Math.PI * 2);
          ctx.arc(px + 24, py + 32, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#35703f';
          ctx.beginPath();
          ctx.arc(px + 16, py + 14, 6, 0, Math.PI * 2);
          ctx.arc(px + 33, py + 30, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawWalls(ctx, level) {
    for (var y = 0; y < level.height; y++) {
      for (var x = 0; x < level.width; x++) {
        if (level.tileAt(x, y) !== '#') continue;
        var px = OX + x * TILE, py = OY + y * TILE;
        ctx.fillStyle = '#323e5c';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#46587f';
        ctx.fillRect(px, py, TILE, 5);
        ctx.fillStyle = 'rgba(212,175,55,0.35)';
        ctx.fillRect(px, py + TILE - 3, TILE, 3);
      }
    }
  }

  function drawExit(ctx, level, pulse) {
    var c = tileCenter(level.exit.x, level.exit.y);
    var glow = 0.5 + 0.3 * Math.sin(pulse);
    ctx.save();
    ctx.shadowColor = '#39d98a'; ctx.shadowBlur = 24 * glow;
    ctx.fillStyle = '#123524';
    ctx.strokeStyle = '#39d98a'; ctx.lineWidth = 3;
    roundRect(ctx, c.x - 20, c.y - 20, 40, 40, 8);
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#7dffb0';
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('EXIT', c.x, c.y + 4);
  }

  function drawPearl(ctx, level, pulse, taken) {
    if (taken) return;
    var c = tileCenter(level.pearl.x, level.pearl.y);
    var r = 11 + 2 * Math.sin(pulse * 1.4);
    ctx.save();
    ctx.shadowColor = '#bfe9ff'; ctx.shadowBlur = 26;
    var g = ctx.createRadialGradient(c.x, c.y, 1, c.x, c.y, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#bfe9ff'); g.addColorStop(1, 'rgba(140,190,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, 22, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7db8e8';
    ctx.beginPath(); ctx.arc(c.x - 3, c.y - 3, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawCones(ctx, state) {
    var E = root.MoonpearlEngine;
    state.guards.forEach(function (g) {
      if (g.down) return;
      var color = g.state === 'alert' ? 'rgba(255,64,64,0.28)'
        : g.state === 'suspicious' || g.state === 'search' ? 'rgba(255,150,50,0.22)'
        : 'rgba(255,205,90,0.16)';
      // Lantern glow around the guard: a soft pool of light that marks the
      // source of the cone, so the cone reads even at contact-sheet size.
      var gc = tileCenter(g.x, g.y);
      var glowColor = g.state === 'alert' ? '255,64,64'
        : g.state === 'suspicious' || g.state === 'search' ? '255,150,50' : '255,205,90';
      var glow = ctx.createRadialGradient(gc.x, gc.y, 6, gc.x, gc.y, 2.2 * TILE);
      glow.addColorStop(0, 'rgba(' + glowColor + ',0.14)');
      glow.addColorStop(1, 'rgba(' + glowColor + ',0)');
      ctx.fillStyle = glow;
      ctx.fillRect(gc.x - 2.2 * TILE, gc.y - 2.2 * TILE, 4.4 * TILE, 4.4 * TILE);
      var R = E.CONE_RANGE;
      for (var y = Math.max(0, g.y - R); y <= Math.min(state.level.height - 1, g.y + R); y++) {
        for (var x = Math.max(0, g.x - R); x <= Math.min(state.level.width - 1, g.x + R); x++) {
          if (state.level.tileAt(x, y) === '#') continue;
          if (!E.canSee(state.level, g, x, y)) continue;
          ctx.fillStyle = color;
          ctx.fillRect(OX + x * TILE + 1, OY + y * TILE + 1, TILE - 2, TILE - 2);
        }
      }
    });
  }

  function drawGuard(ctx, g, interp) {
    var c = tileCenter(g.x, g.y);
    if (g.down) {
      ctx.fillStyle = '#5a6478';
      ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c8d2e8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - 6, c.y - 5); ctx.lineTo(c.x + 6, c.y + 5);
      ctx.moveTo(c.x + 6, c.y - 5); ctx.lineTo(c.x - 6, c.y + 5);
      ctx.stroke();
      ctx.fillStyle = '#9fb2d8'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Zz', c.x + 12, c.y - 12);
      return;
    }
    // Lantern glow.
    ctx.save();
    ctx.shadowColor = '#ffc442'; ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffc442';
    ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Body: navy warden with gold trim, facing wedge.
    ctx.fillStyle = '#2e4a7a';
    ctx.strokeStyle = '#d4af37'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0f1830';
    ctx.beginPath(); ctx.arc(c.x + g.dirX * 5, c.y + g.dirY * 5, 5, 0, Math.PI * 2); ctx.fill();
    // State mark: ? while suspicious, ! while alert.
    if (g.state === 'suspicious' || g.state === 'search') {
      ctx.fillStyle = '#ffb347'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('?', c.x, c.y - 20);
    } else if (g.state === 'alert') {
      ctx.fillStyle = '#ff5252'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', c.x, c.y - 20);
    }
  }

  function drawPlayer(ctx, state, pulse) {
    var p = state.player;
    var c = tileCenter(p.x, p.y);
    // Noise ripple while walking: shows the 2-tile hearing radius.
    if (state.lastWalked) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, TILE * 2, 0, Math.PI * 2); ctx.stroke();
    }
    // Soft light around the thief.
    ctx.save();
    var g = ctx.createRadialGradient(c.x, c.y, 4, c.x, c.y, 46);
    g.addColorStop(0, 'rgba(150,120,255,0.20)'); g.addColorStop(1, 'rgba(150,120,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y, 46, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Hooded figure: violet cloak, pale scarf, facing tick, white ring so
    // the thief reads at a glance even when the frame is shrunk.
    ctx.fillStyle = '#6a4fd0';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#b9a5ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#efe9ff';
    ctx.beginPath(); ctx.arc(c.x + p.dirX * 6, c.y + p.dirY * 6, 5, 0, Math.PI * 2); ctx.fill();
    // Sneak ring: a dashed circle while sneaking silently.
    if (state.sneakHeld) {
      ctx.strokeStyle = 'rgba(185,165,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(c.x, c.y, 20, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Detection ring over the thief's head.
    if (state.detection > 1) {
      var frac = state.detection / 100;
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y - 24, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = state.detection >= 100 ? '#ff5252' : state.detection >= 40 ? '#ffb347' : '#ffc442';
      ctx.beginPath(); ctx.arc(c.x, c.y - 24, 8, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
    }
  }

  function drawParticles(ctx, particles) {
    particles.forEach(function (pt) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawHUD(ctx, state) {
    var level = state.level, p = state.player;
    ctx.fillStyle = '#10141f';
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(0, HUD_H - 2, VIEW_W, 2);
    ctx.fillStyle = '#f2ead8';
    ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('MOONPEARL HEIST', 20, 30);
    ctx.fillStyle = '#9fb2d8'; ctx.font = '13px sans-serif';
    var objective = state.pearlTaken ? 'Pearl stolen — reach the EXIT unseen' : 'Steal the Moonpearl, then reach the EXIT';
    ctx.fillText(objective, 20, 52);
    // Detection meter.
    var mx = 560, mw = 260;
    ctx.fillStyle = '#222a3d';
    roundRect(ctx, mx, 18, mw, 16, 8); ctx.fill();
    var frac = state.detection / 100;
    var col = state.detection >= 100 ? '#ff5252' : state.detection >= 40 ? '#ff9f43' : '#ffc442';
    ctx.fillStyle = col;
    if (frac > 0) { roundRect(ctx, mx, 18, Math.max(8, mw * frac), 16, 8); ctx.fill(); }
    ctx.fillStyle = '#f2ead8'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left';
    var label = state.detection >= 100 ? 'ALERT!' : state.detection >= 40 ? 'SUSPICIOUS' : state.detection > 1 ? 'SEEN' : 'HIDDEN';
    ctx.fillText('DETECTION  ' + label, mx, 50);
    // Lives, coins, timer.
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ff7d9c'; ctx.font = 'bold 20px sans-serif';
    var hearts = '';
    for (var i = 0; i < 3; i++) hearts += i < p.lives ? '♥' : '♡';
    ctx.fillText(hearts, 860, 32);
    ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText('● ' + p.coins + ' coins', 860, 54);
    ctx.fillStyle = '#9fb2d8'; ctx.font = '14px sans-serif';
    ctx.fillText('⏱ ' + (state.tick / 10).toFixed(1) + 's', 1000, 32);
    ctx.fillText('Guards down: ' + state.guards.filter(function (g) { return g.down; }).length + '/4', 1000, 54);
    // Caught flash.
    if (state.flashRed > 0) {
      ctx.fillStyle = 'rgba(255,40,40,' + (0.25 * state.flashRed) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  function drawTitle(ctx, state) {
    ctx.fillStyle = 'rgba(8,10,18,0.82)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#f2ead8'; ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText('MOONPEARL HEIST', VIEW_W / 2, 250);
    ctx.fillStyle = '#d4af37'; ctx.font = '18px sans-serif';
    ctx.fillText('A stealth game in the Hall of Echoes', VIEW_W / 2, 288);
    ctx.fillStyle = '#c8d2e8'; ctx.font = '16px sans-serif';
    ctx.fillText('Steal the Moonpearl, then slip out the EXIT unseen.', VIEW_W / 2, 340);
    ctx.fillText('WASD / arrows — move   Shift — sneak (silent, slow)   Space — wait', VIEW_W / 2, 372);
    ctx.fillText('C — throw a coin to distract   E — takedown from behind   P — pause   R — restart', VIEW_W / 2, 398);
    ctx.fillText('Bushes hide you. Shadows halve how fast guards spot you.', VIEW_W / 2, 424);
    ctx.fillText('Walking is noisy — guards hear you within 2 tiles.', VIEW_W / 2, 450);
    ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Click or press Enter to begin', VIEW_W / 2, 510);
  }

  function drawEnd(ctx, state) {
    ctx.fillStyle = 'rgba(8,10,18,0.78)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    if (state.won) {
      ctx.fillStyle = '#7dffb0'; ctx.font = 'bold 40px sans-serif';
      ctx.fillText('THE PEARL IS YOURS', VIEW_W / 2, 330);
      ctx.fillStyle = '#f2ead8'; ctx.font = '18px sans-serif';
      ctx.fillText('You slipped out unseen in ' + (state.tick / 10).toFixed(1) + ' seconds.', VIEW_W / 2, 372);
      ctx.fillText('Peak detection ' + Math.round(state.peakDetection || 0) + ' / 100 — press R to play again.', VIEW_W / 2, 402);
    } else {
      ctx.fillStyle = '#ff7d9c'; ctx.font = 'bold 40px sans-serif';
      ctx.fillText('CAUGHT IN THE DARK', VIEW_W / 2, 330);
      ctx.fillStyle = '#f2ead8'; ctx.font = '18px sans-serif';
      ctx.fillText('The Wardens have the Hall. Press R to try again.', VIEW_W / 2, 372);
    }
  }

  function drawPaused(ctx) {
    ctx.fillStyle = 'rgba(8,10,18,0.6)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#f2ead8'; ctx.textAlign = 'center';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('PAUSED', VIEW_W / 2, 380);
    ctx.font = '16px sans-serif';
    ctx.fillText('Press P to resume', VIEW_W / 2, 416);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGame(ctx, state, opts) {
    opts = opts || {};
    var pulse = (state.tick / 10) + (opts.pulse || 0);
    ctx.fillStyle = '#0b0e18';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawFloor(ctx, state.level);
    drawCones(ctx, state);
    drawWalls(ctx, state.level);
    drawExit(ctx, state.level, pulse);
    drawPearl(ctx, state.level, pulse, state.pearlTaken);
    state.guards.forEach(function (g) { drawGuard(ctx, g); });
    drawPlayer(ctx, state, pulse);
    drawParticles(ctx, state.particles || []);
    drawHUD(ctx, state);
    // Hint line under the playfield.
    ctx.fillStyle = '#7c8aa8'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('WASD move · Shift sneak · Space wait · C coin · E takedown · P pause · R restart', VIEW_W / 2, VIEW_H - 14);
    if (state.phase === 'title') drawTitle(ctx, state);
    else if (state.won || state.over) drawEnd(ctx, state);
    else if (state.phase === 'paused') drawPaused(ctx);
  }

  var api = {
    TILE: TILE, VIEW_W: VIEW_W, VIEW_H: VIEW_H, OX: OX, OY: OY,
    tileCenter: tileCenter, drawGame: drawGame,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonpearlRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
