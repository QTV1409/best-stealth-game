// Moonpearl Heist — the level: the Hall of Echoes, a moonlit museum.
// Legend: # wall, . floor, B bush (planter, hides you), S shadow (dark
// floor, detection fills half as fast), P player start, M the Moonpearl,
// E the exit. Guards patrol fixed routes; every patrol shares one 50-tick
// cycle so the player can learn the timing.
(function (root) {
  'use strict';

  var GRID = [
    '########################',
    '#....S...........M....E#',
    '#..B................B..#',
    '#......................#',
    '#....##..........##....#',
    '#....##..........##....#',
    '#.........SSSS.........#',
    '#.......###..###.......#',
    '#.........SSSS.........#',
    '#....##..........##....#',
    '#....##..........##....#',
    '#..B................B..#',
    '#P...S.................#',
    '########################',
  ];

  var TILE_WALKABLE = { '#': false, '.': true, B: true, S: true, P: true, M: true, E: true };

  function buildLevel() {
    var height = GRID.length, width = GRID[0].length;
    var start = null, pearl = null, exit = null;
    for (var y = 0; y < height; y++) {
      if (GRID[y].length !== width) throw new Error('level row ' + y + ' is not ' + width + ' wide');
      for (var x = 0; x < width; x++) {
        var t = GRID[y][x];
        if (t === 'P') start = { x: x, y: y };
        if (t === 'M') pearl = { x: x, y: y };
        if (t === 'E') exit = { x: x, y: y };
      }
    }
    return {
      name: 'The Hall of Echoes',
      width: width, height: height, grid: GRID,
      start: start, pearl: pearl, exit: exit,
      coins: 3,
      guards: [
        // Hall Warden: sweeps the top corridor, left half.
        { name: 'Hall Warden', waypoints: [{ x: 4, y: 2 }, { x: 11, y: 2 }], pause: 10 },
        // Vault Warden: sweeps the top corridor, right half, under the pearl.
        { name: 'Vault Warden', waypoints: [{ x: 13, y: 2 }, { x: 20, y: 2 }], pause: 10 },
        // Gallery Warden: walks the long spine through the middle gate.
        { name: 'Gallery Warden', waypoints: [{ x: 12, y: 3 }, { x: 12, y: 10 }], pause: 10 },
        // Door Warden: sweeps the bottom corridor over the entrance.
        { name: 'Door Warden', waypoints: [{ x: 6, y: 11 }, { x: 13, y: 11 }], pause: 10 },
      ],
      tileAt: function (x, y) {
        if (x < 0 || y < 0 || x >= width || y >= height) return '#';
        return GRID[y][x];
      },
      isWall: function (x, y) {
        return this.tileAt(x, y) === '#';
      },
      walkable: function (x, y) {
        var t = this.tileAt(x, y);
        return !!TILE_WALKABLE[t];
      },
    };
  }

  var api = { GRID: GRID, buildLevel: buildLevel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MoonpearlLevel = api;
})(typeof window !== 'undefined' ? window : globalThis);
