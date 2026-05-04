// @ts-check

/* landing-puzzle.js — renders the landing-page sample puzzle for the selected Hecate puzzle type */
(function () {
  "use strict";

  if (window.__HECATE_LANDING_SAMPLE_BOOTED__) {
    return;
  }
  window.__HECATE_LANDING_SAMPLE_BOOTED__ = true;

  var defaultPuzzleType = "crossword";
  var puzzleTypeWordSearch = "word_search";
  var puzzleDataPath = "assets/data/puzzles.json";
  var services = window.HecateServices || null;
  var _fetch = window.fetch.bind(window);
  var container = document.getElementById("landingSamplePuzzle");
  var landingTitle = document.querySelector(".landing__title");
  var landingSubtitle = document.querySelector(".landing__subtitle");
  var practiceSpecificationsPromise = null;

  if (!container || typeof generateCrossword !== "function" || typeof generateWordSearch !== "function") {
    return;
  }

  function buildApiUrl(path) {
    if (services && typeof services.buildApiUrl === "function") {
      return services.buildApiUrl(path);
    }
    return path;
  }

  function normalizePuzzleType(value) {
    return value === puzzleTypeWordSearch ? puzzleTypeWordSearch : defaultPuzzleType;
  }

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

  function buildPuzzleFromSpecification(specification) {
    var puzzleType = normalizePuzzleType(specification && specification.puzzle_type);
    var layoutSeed = specification && specification.layout_seed
      ? specification.layout_seed
      : "landing:" + puzzleType + ":" + String(specification && specification.title || "");
    var layoutVersion = specification && specification.layout_version ? specification.layout_version : 1;

    if (puzzleType === puzzleTypeWordSearch) {
      return generateWordSearch(specification.items, {
        title: specification.title,
        subtitle: specification.subtitle || "",
        description: specification.description || "",
        layoutSeed: layoutSeed,
        layoutVersion: layoutVersion,
        options: specification.options || null,
      });
    }

    return generateCrossword(specification.items, {
      title: specification.title,
      subtitle: specification.subtitle || "",
      description: specification.description || "",
      random: createDeterministicRandom(layoutSeed + ":" + layoutVersion),
    });
  }

  function getFallbackSpecifications() {
    return [
      {
        puzzle_type: "crossword",
        title: "Moon Signals",
        subtitle: "A compact crossword for a quick Hecate preview.",
        items: [
          { word: "orbit", definition: "Path around Earth", hint: "route" },
          { word: "mare", definition: "Lunar sea", hint: "horse" },
          { word: "tides", definition: "Moon-pulled ocean shifts", hint: "shoreline changes" },
          { word: "lunar", definition: "Moon-related", hint: "night sky" },
          { word: "apollo", definition: "Moon program", hint: "missions" },
        ],
      },
      {
        puzzle_type: "word_search",
        title: "Forest Finds",
        subtitle: "A fast word search preview of the second Hecate format.",
        items: [
          { word: "moss", definition: "Soft green carpet", hint: "clings to damp stone" },
          { word: "fern", definition: "Feathery woodland plant", hint: "uncurls from a fiddlehead" },
          { word: "cedar", definition: "Fragrant evergreen", hint: "aromatic timber tree" },
          { word: "owl", definition: "Nocturnal hunter", hint: "silent wings" },
          { word: "brook", definition: "Small stream", hint: "runs over stones" },
          { word: "glade", definition: "Open patch in a forest", hint: "sunlit clearing" },
        ],
        options: { directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] },
      },
    ];
  }

  function findSpecificationByType(specifications, puzzleType) {
    var normalizedPuzzleType = normalizePuzzleType(puzzleType);
    var index;

    for (index = 0; index < specifications.length; index++) {
      if (normalizePuzzleType(specifications[index].puzzle_type) === normalizedPuzzleType) {
        return specifications[index];
      }
    }
    return null;
  }

  function getSelectedPuzzleType() {
    if (window.HecateApp && typeof window.HecateApp.getSelectedPuzzleType === "function") {
      return normalizePuzzleType(window.HecateApp.getSelectedPuzzleType());
    }
    return defaultPuzzleType;
  }

  function renderSampleShell(titleText, subtitleText) {
    var titleElement = document.createElement("h2");
    var subtitleElement = document.createElement("p");
    var body = document.createElement("div");

    container.innerHTML = "";
    titleElement.className = "landing__sample-title";
    titleElement.textContent = titleText;
    subtitleElement.className = "landing__sample-subtitle";
    subtitleElement.textContent = subtitleText || "";
    body.className = "landing__sample-body";

    container.appendChild(titleElement);
    container.appendChild(subtitleElement);
    container.appendChild(body);
    return body;
  }

  function updateLandingCopy(puzzleType) {
    if (!landingTitle || !landingSubtitle) return;
    if (normalizePuzzleType(puzzleType) === puzzleTypeWordSearch) {
      landingTitle.textContent = "Create crosswords and word searches with AI";
      landingSubtitle.textContent = "Switch formats instantly, generate from any topic, and solve inside one Hecate workspace.";
      return;
    }
    landingTitle.textContent = "Create crosswords and word searches with AI";
    landingSubtitle.textContent = "Choose a puzzle type, generate it from any topic, or try a sample before you sign in.";
  }

  function renderSpecification(specification) {
    var puzzle = buildPuzzleFromSpecification(specification);
    var shell = renderSampleShell(specification.title, specification.subtitle || "");

    if (normalizePuzzleType(specification.puzzle_type) === puzzleTypeWordSearch) {
      new window.WordSearchWidget(shell, {
        puzzle: puzzle,
      }).render(puzzle);
      return;
    }

    new window.CrosswordWidget(shell, {
      puzzle: puzzle,
      hints: true,
      responsive: true,
      draggable: false,
      keyboard: false,
      showTitle: false,
      showControls: true,
      showSelector: false,
    });
  }

  function loadPracticeSpecifications() {
    if (practiceSpecificationsPromise) return practiceSpecificationsPromise;

    practiceSpecificationsPromise = _fetch(puzzleDataPath)
      .then(function (response) {
        if (!response.ok) throw new Error("Sample puzzles unavailable");
        return response.json();
      })
      .then(function (specifications) {
        if (!Array.isArray(specifications)) {
          throw new Error("Puzzle data must be an array");
        }
        return specifications;
      })
      .catch(function () {
        return getFallbackSpecifications();
      });

    return practiceSpecificationsPromise;
  }

  function renderSelectedSample(puzzleType) {
    loadPracticeSpecifications().then(function (specifications) {
      var specification = findSpecificationByType(specifications, puzzleType) ||
        findSpecificationByType(getFallbackSpecifications(), puzzleType);
      updateLandingCopy(puzzleType);
      renderSpecification(specification);
    });
  }

  function applySharedPuzzleCopy(sharedPuzzle) {
    if (!landingTitle || !landingSubtitle) return;
    landingTitle.textContent = (sharedPuzzle && sharedPuzzle.title) || "Shared Puzzle";
    landingSubtitle.textContent = "Someone shared a Hecate puzzle with you. Preview it here or open the full workspace.";
  }

  function renderSharedPuzzle(sharedToken) {
    container.textContent = "Loading shared puzzle...";

    _fetch(buildApiUrl("/api/shared/" + encodeURIComponent(sharedToken)))
      .then(function (response) {
        if (!response.ok) throw new Error("Puzzle not found");
        return response.json();
      })
      .then(function (sharedPuzzle) {
        var specification = {
          puzzle_type: sharedPuzzle && sharedPuzzle.puzzle_type ? sharedPuzzle.puzzle_type : defaultPuzzleType,
          title: sharedPuzzle && sharedPuzzle.title ? sharedPuzzle.title : "Shared Puzzle",
          subtitle: sharedPuzzle && sharedPuzzle.subtitle ? sharedPuzzle.subtitle : "",
          description: sharedPuzzle && sharedPuzzle.description ? sharedPuzzle.description : "",
          items: sharedPuzzle && Array.isArray(sharedPuzzle.items) ? sharedPuzzle.items : [],
          layout_seed: sharedPuzzle && sharedPuzzle.layout_seed ? sharedPuzzle.layout_seed : sharedToken,
          layout_version: sharedPuzzle && sharedPuzzle.layout_version ? sharedPuzzle.layout_version : 1,
          options: sharedPuzzle && sharedPuzzle.options ? sharedPuzzle.options : null,
        };

        applySharedPuzzleCopy(sharedPuzzle);
        renderSpecification(specification);
      })
      .catch(function (error) {
        container.textContent = "Could not load shared puzzle. It may have been deleted. (" + error.message + ")";
      });
  }

  window.addEventListener("hecate:puzzle-type-selected", function (event) {
    if (sharedToken) {
      return;
    }
    renderSelectedSample(normalizePuzzleType(event && event.detail));
  });

  (window.__HECATE_TEST__ || (window.__HECATE_TEST__ = {})).landing = {
    buildPuzzleFromSpecification: buildPuzzleFromSpecification,
    createDeterministicRandom: createDeterministicRandom,
    findSpecificationByType: findSpecificationByType,
    getFallbackSpecifications: getFallbackSpecifications,
    normalizePuzzleType: normalizePuzzleType,
    renderSelectedSample: renderSelectedSample,
  };

  var params = new URLSearchParams(window.location.search);
  var sharedToken = params.get("puzzle");

  if (sharedToken) {
    renderSharedPuzzle(sharedToken);
    return;
  }

  renderSelectedSample(getSelectedPuzzleType());
})();
