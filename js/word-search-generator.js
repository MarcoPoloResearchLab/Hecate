// @ts-check

/* word-search-generator.js - builds a deterministic word-search payload from [{word, definition, hint}] */
(function () {
  "use strict";

  var DEFAULT_DIRECTIONS = Object.freeze(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  var COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;
  var GENERATED_WORD_PATTERN = /^[A-Z]{3,12}$/;
  var DIRECTION_VECTORS = Object.freeze({
    N: Object.freeze({ row: -1, col: 0 }),
    NE: Object.freeze({ row: -1, col: 1 }),
    E: Object.freeze({ row: 0, col: 1 }),
    SE: Object.freeze({ row: 1, col: 1 }),
    S: Object.freeze({ row: 1, col: 0 }),
    SW: Object.freeze({ row: 1, col: -1 }),
    W: Object.freeze({ row: 0, col: -1 }),
    NW: Object.freeze({ row: -1, col: -1 }),
  });

  function createSeedHash(seedText) {
    var hash = 1779033703 ^ seedText.length;
    var index;

    for (index = 0; index < seedText.length; index++) {
      hash = Math.imul(hash ^ seedText.charCodeAt(index), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }

    return function () {
      hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
      hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
      hash ^= hash >>> 16;
      return hash >>> 0;
    };
  }

  function createDeterministicRandom(seedText) {
    var seed = createSeedHash(String(seedText || ""))();

    return function () {
      seed += 0x6D2B79F5;
      var next = Math.imul(seed ^ (seed >>> 15), seed | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(random, maxExclusive) {
    return Math.floor(random() * maxExclusive);
  }

  function normalizeDirections(options) {
    var rawDirections = options && Array.isArray(options.directions) ? options.directions : DEFAULT_DIRECTIONS;
    var normalized = [];
    var index;

    for (index = 0; index < rawDirections.length; index++) {
      if (typeof rawDirections[index] === "string" && DIRECTION_VECTORS[rawDirections[index]]) {
        normalized.push(rawDirections[index]);
      }
    }

    return normalized.length > 0 ? normalized : DEFAULT_DIRECTIONS.slice();
  }

  function normalizePuzzleWord(rawWord) {
    var normalizedWord = String(rawWord || "")
      .trim()
      .normalize("NFD")
      .replace(COMBINING_MARKS_PATTERN, "")
      .toUpperCase();

    return GENERATED_WORD_PATTERN.test(normalizedWord) ? normalizedWord : "";
  }

  function normalizeItems(items) {
    var normalized = [];
    var seenWords = {};
    var index;
    var item;
    var cleanedWord;

    for (index = 0; index < items.length; index++) {
      item = items[index] || {};
      cleanedWord = normalizePuzzleWord(item.word);
      if (cleanedWord === "") {
        throw new Error("Invalid word search word (need length 3-12, A-Z).");
      }
      if (seenWords[cleanedWord]) {
        continue;
      }
      seenWords[cleanedWord] = true;
      normalized.push({
        id: "W" + index,
        word: cleanedWord,
        definition: String(item.definition || "").trim(),
        hint: String(item.hint || "").trim(),
      });
    }

    normalized.sort(function (left, right) {
      if (right.word.length !== left.word.length) {
        return right.word.length - left.word.length;
      }
      return left.word < right.word ? -1 : 1;
    });

    return normalized;
  }

  function buildEmptyGrid(size) {
    var rowIndex;
    var grid = [];

    for (rowIndex = 0; rowIndex < size; rowIndex++) {
      grid.push(new Array(size).fill(""));
    }

    return grid;
  }

  function inBounds(size, row, col) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  function canPlaceWord(grid, size, word, startRow, startCol, direction) {
    var step = DIRECTION_VECTORS[direction];
    var index;
    var row;
    var col;
    var existing;
    var overlapCount = 0;

    for (index = 0; index < word.length; index++) {
      row = startRow + step.row * index;
      col = startCol + step.col * index;
      if (!inBounds(size, row, col)) return null;
      existing = grid[row][col];
      if (existing && existing !== word.charAt(index)) {
        return null;
      }
      if (existing === word.charAt(index)) {
        overlapCount++;
      }
    }

    return overlapCount;
  }

  function collectCandidates(grid, size, item, directions, random) {
    var candidates = [];
    var directionIndex;
    var direction;
    var rowIndex;
    var colIndex;
    var overlapCount;

    for (directionIndex = 0; directionIndex < directions.length; directionIndex++) {
      direction = directions[directionIndex];
      for (rowIndex = 0; rowIndex < size; rowIndex++) {
        for (colIndex = 0; colIndex < size; colIndex++) {
          overlapCount = canPlaceWord(grid, size, item.word, rowIndex, colIndex, direction);
          if (overlapCount === null) continue;
          candidates.push({
            row: rowIndex,
            col: colIndex,
            dir: direction,
            overlapCount: overlapCount,
            tieBreaker: random(),
          });
        }
      }
    }

    candidates.sort(function (left, right) {
      if (right.overlapCount !== left.overlapCount) {
        return right.overlapCount - left.overlapCount;
      }
      return left.tieBreaker - right.tieBreaker;
    });

    return candidates;
  }

  function placeWord(grid, item, placement) {
    var step = DIRECTION_VECTORS[placement.dir];
    var index;

    for (index = 0; index < item.word.length; index++) {
      grid[placement.row + step.row * index][placement.col + step.col * index] = item.word.charAt(index);
    }
  }

  function fillBlanks(grid, random) {
    var rowIndex;
    var colIndex;

    for (rowIndex = 0; rowIndex < grid.length; rowIndex++) {
      for (colIndex = 0; colIndex < grid[rowIndex].length; colIndex++) {
        if (!grid[rowIndex][colIndex]) {
          grid[rowIndex][colIndex] = String.fromCharCode(65 + randomInt(random, 26));
        }
      }
    }
  }

  function estimateGridSize(items) {
    var longestWord = 0;
    var totalLetters = 0;
    var index;

    for (index = 0; index < items.length; index++) {
      longestWord = Math.max(longestWord, items[index].word.length);
      totalLetters += items[index].word.length;
    }

    return Math.max(longestWord + 1, Math.ceil(Math.sqrt(totalLetters * 1.6)));
  }

  function buildPayload(items, placements, grid, opts, directions) {
    return {
      puzzleType: "word_search",
      title: opts.title || "Word Search",
      subtitle: opts.subtitle || "",
      description: typeof opts.description === "string" ? opts.description : "",
      layoutSeed: String(opts.layoutSeed || ""),
      layoutVersion: Number(opts.layoutVersion || 1),
      options: { directions: directions.slice() },
      items: items.map(function (item) {
        return {
          id: item.id,
          word: item.word,
          definition: item.definition,
          hint: item.hint,
        };
      }),
      placements: placements,
      grid: grid,
      size: grid.length,
    };
  }

  function buildWordSearchFromNormalizedItems(normalizedItems, resolvedOptions, directions, layoutSeed, layoutVersion, size, sizeLimit) {
    var random = createDeterministicRandom(layoutSeed + ":" + layoutVersion);
    var currentSize;
    var grid;
    var placements;
    var itemIndex;
    var item;
    var candidates;
    var candidate;

    for (currentSize = size; currentSize <= sizeLimit; currentSize++) {
      grid = buildEmptyGrid(currentSize);
      placements = [];

      for (itemIndex = 0; itemIndex < normalizedItems.length; itemIndex++) {
        item = normalizedItems[itemIndex];
        candidates = collectCandidates(grid, currentSize, item, directions, random);
        if (candidates.length === 0) {
          placements = null;
          break;
        }
        candidate = candidates[0];
        placeWord(grid, item, candidate);
        placements.push({
          id: item.id,
          word: item.word,
          row: candidate.row,
          col: candidate.col,
          dir: candidate.dir,
          hint: item.hint,
        });
      }

      if (placements) {
        fillBlanks(grid, random);
        return buildPayload(normalizedItems, placements, grid, {
          title: resolvedOptions.title || "Word Search",
          subtitle: resolvedOptions.subtitle || "",
          description: resolvedOptions.description || "",
          layoutSeed: layoutSeed,
          layoutVersion: layoutVersion,
        }, directions);
      }
    }

    throw new Error("Failed to generate a valid word search within the layout budget.");
  }

  function generateWordSearch(items, opts) {
    var resolvedOptions = opts || {};
    var normalizedItems = normalizeItems(items || []);
    var directions = normalizeDirections(resolvedOptions.options);
    var layoutSeed = String(resolvedOptions.layoutSeed || "word-search-default-seed");
    var layoutVersion = Number(resolvedOptions.layoutVersion || 1);
    var size;

    if (normalizedItems.length === 0) {
      throw new Error("No valid words for word search generation.");
    }
    if (layoutVersion !== 1) {
      throw new Error("Unsupported word search layout version.");
    }

    size = estimateGridSize(normalizedItems);
    return buildWordSearchFromNormalizedItems(normalizedItems, resolvedOptions, directions, layoutSeed, layoutVersion, size, size + 6);
  }

  generateWordSearch.__test = {
    buildEmptyGrid: buildEmptyGrid,
    buildPayload: buildPayload,
    buildWordSearchFromNormalizedItems: buildWordSearchFromNormalizedItems,
    canPlaceWord: canPlaceWord,
    collectCandidates: collectCandidates,
    createDeterministicRandom: createDeterministicRandom,
    estimateGridSize: estimateGridSize,
    normalizeDirections: normalizeDirections,
    normalizeItems: normalizeItems,
    normalizePuzzleWord: normalizePuzzleWord,
  };

  window.generateWordSearch = generateWordSearch;
})();
