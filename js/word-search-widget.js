// @ts-check

/* word-search-widget.js - reusable WordSearchWidget class */
(function () {
  "use strict";

  var hiddenStyleValue = "none";
  var emptyString = "";
  var defaultCellSize = 44;
  var minimumCellSize = 36;
  var pixelUnit = "px";
  var cssCellSizeProperty = "--cell-size";
  var cssGapSizeProperty = "--gap-size";
  var singleCellSelectionLength = 1;
  var dragCoachAutoHideDelayMs = 1800;
  var dragCoachWidthPx = 112;
  var dragCoachVerticalOffsetPx = 46;
  var viewportPaddingPx = 8;
  var hintButtonText = "H";
  var hintUnavailableText = "Hint unavailable.";

  /**
   * @param {number} row
   * @param {number} col
   * @returns {string}
   */
  function cellKey(row, col) {
    return row + ":" + col;
  }

  /**
   * @param {string} direction
   * @returns {{row:number,col:number}}
   */
  function directionVector(direction) {
    switch (direction) {
      case "N": return { row: -1, col: 0 };
      case "NE": return { row: -1, col: 1 };
      case "E": return { row: 0, col: 1 };
      case "SE": return { row: 1, col: 1 };
      case "S": return { row: 1, col: 0 };
      case "SW": return { row: 1, col: -1 };
      case "W": return { row: 0, col: -1 };
      case "NW": return { row: -1, col: -1 };
      default: return { row: 0, col: 0 };
    }
  }

  function selectionCells(startRow, startCol, endRow, endCol) {
    var rowDelta = endRow - startRow;
    var colDelta = endCol - startCol;
    var rowStep = rowDelta === 0 ? 0 : rowDelta / Math.abs(rowDelta);
    var colStep = colDelta === 0 ? 0 : colDelta / Math.abs(colDelta);
    var length = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
    var cells = [];
    var index;

    if (!(rowDelta === 0 || colDelta === 0 || Math.abs(rowDelta) === Math.abs(colDelta))) {
      return [];
    }

    for (index = 0; index <= length; index++) {
      cells.push({
        row: startRow + rowStep * index,
        col: startCol + colStep * index,
      });
    }

    return cells;
  }

  function computeBoundedCellSize(viewportWidth, columnCount, gapSize) {
    var totalGapWidth = Math.max(0, columnCount - 1) * gapSize;
    var fittedCellSize = Math.floor((viewportWidth - totalGapWidth) / columnCount);
    return Math.max(minimumCellSize, Math.min(defaultCellSize, fittedCellSize));
  }

  function WordSearchWidget(container, options) {
    this._container = container || null;
    this._options = options || {};
    this._existing = this._options._existingElements || {};
    this._gridEl = this._existing.gridEl || null;
    this._gridViewport = this._existing.gridViewport || null;
    this._wordSearchPanel = this._existing.wordSearchPanel || null;
    this._wordSearchList = this._existing.wordSearchList || null;
    this._wordSearchProgress = this._existing.wordSearchProgress || null;
    this._wordSearchHint = this._existing.wordSearchHint || null;
    this._checkBtn = this._existing.checkBtn || null;
    this._revealBtn = this._existing.revealBtn || null;
    this._statusEl = this._existing.statusEl || null;
    this._errorBox = this._existing.errorBox || null;
    this._cellsByKey = {};
    this._placementsById = {};
    this._itemsById = {};
    this._listById = {};
    this._selection = null;
    this._foundIds = {};
    this._usedHint = false;
    this._usedReveal = false;
    this._completionEmitted = false;
    this._hintTimeout = null;
    this._dragCoachEl = null;
    this._dragCoachTimeout = null;
    this._touchEndHandler = null;
    this._currentColumnCount = 0;
  }

  WordSearchWidget.prototype.ensureStandaloneElements = function () {
    if (!this._container || this._gridEl) return;

    var layout = document.createElement("div");
    var viewport = document.createElement("div");
    var grid = document.createElement("div");
    var panel = document.createElement("div");
    var header = document.createElement("div");
    var heading = document.createElement("h3");
    var progress = document.createElement("div");
    var hint = document.createElement("div");
    var list = document.createElement("ol");

    layout.className = "landing__sample-layout";
    viewport.className = "gridViewport landing__sample-grid";
    grid.className = "grid";
    panel.className = "clues word-search-panel landing__sample-clues";
    header.className = "word-search-panel__header";
    heading.className = "word-search-panel__title";
    heading.textContent = "Find these words";
    progress.className = "word-search-panel__progress";
    hint.className = "word-search-panel__hint";
    hint.style.display = hiddenStyleValue;
    list.className = "word-search-list";

    header.appendChild(heading);
    header.appendChild(progress);
    panel.appendChild(header);
    panel.appendChild(hint);
    panel.appendChild(list);
    viewport.appendChild(grid);
    layout.appendChild(viewport);
    layout.appendChild(panel);

    this._container.innerHTML = "";
    this._container.appendChild(layout);

    this._gridViewport = viewport;
    this._gridEl = grid;
    this._wordSearchPanel = panel;
    this._wordSearchList = list;
    this._wordSearchProgress = progress;
    this._wordSearchHint = hint;
  };

  WordSearchWidget.prototype.recalculate = function () {
    if (!this._gridViewport || !this._gridEl) return;
    var viewportWidth = Math.max(1, this._gridViewport.clientWidth);
    var columnCount = Math.max(1, this._currentColumnCount);
    var gridStyles = getComputedStyle(this._gridEl);
    var gapSize = parseInt(gridStyles.getPropertyValue(cssGapSizeProperty), 10) || 0;
    this._gridViewport.style.setProperty(
      cssCellSizeProperty,
      computeBoundedCellSize(viewportWidth, columnCount, gapSize) + pixelUnit
    );
  };

  WordSearchWidget.prototype.clearTransientSelection = function () {
    var selected = this._gridEl ? this._gridEl.querySelectorAll(".word-search-cell--selected") : [];
    var index;
    for (index = 0; index < selected.length; index++) {
      selected[index].classList.remove("word-search-cell--selected");
    }
  };

  WordSearchWidget.prototype.clearHintPulse = function () {
    var hinted = this._gridEl ? this._gridEl.querySelectorAll(".word-search-cell--hinted") : [];
    var index;
    for (index = 0; index < hinted.length; index++) {
      hinted[index].classList.remove("word-search-cell--hinted");
    }
    if (this._hintTimeout) {
      clearTimeout(this._hintTimeout);
      this._hintTimeout = null;
    }
  };

  WordSearchWidget.prototype.clearWordSearchHint = function () {
    if (!this._wordSearchHint) return;
    this._wordSearchHint.hidden = true;
    this._wordSearchHint.style.display = hiddenStyleValue;
    this._wordSearchHint.textContent = emptyString;
  };

  WordSearchWidget.prototype.updateWordSearchHint = function (message) {
    if (!this._wordSearchHint) return;
    this._wordSearchHint.hidden = false;
    this._wordSearchHint.style.display = emptyString;
    this._wordSearchHint.textContent = message;
  };

  WordSearchWidget.prototype.clearDragCoach = function () {
    var dragCoachEl = this._dragCoachEl;

    clearTimeout(this._dragCoachTimeout);
    this._dragCoachTimeout = null;
    this._dragCoachEl = null;
    if (!dragCoachEl) return;
    dragCoachEl.remove();
  };

  WordSearchWidget.prototype.createDragCoach = function () {
    var dragCoach = document.createElement("div");
    var startDot = document.createElement("span");
    var trail = document.createElement("span");
    var endDot = document.createElement("span");

    dragCoach.className = "word-search-drag-coach";
    dragCoach.setAttribute("data-word-search-drag-coach", "true");
    dragCoach.setAttribute("role", "img");
    dragCoach.setAttribute("aria-label", "Drag across letters to select a word");
    startDot.className = "word-search-drag-coach__dot word-search-drag-coach__dot--start";
    trail.className = "word-search-drag-coach__trail";
    endDot.className = "word-search-drag-coach__dot word-search-drag-coach__dot--end";
    startDot.setAttribute("aria-hidden", "true");
    trail.setAttribute("aria-hidden", "true");
    endDot.setAttribute("aria-hidden", "true");

    dragCoach.appendChild(startDot);
    dragCoach.appendChild(trail);
    dragCoach.appendChild(endDot);
    return dragCoach;
  };

  WordSearchWidget.prototype.showDragCoach = function (cell) {
    var dragCoach;
    var cellRect;
    var viewportWidth;
    var left;
    var top;

    this.clearDragCoach();
    dragCoach = this.createDragCoach();
    cellRect = cell.getBoundingClientRect();
    viewportWidth = Math.max(dragCoachWidthPx + viewportPaddingPx * 2, window.innerWidth);
    left = Math.max(
      viewportPaddingPx,
      Math.min(
        cellRect.left + cellRect.width / 2 - dragCoachWidthPx / 2,
        viewportWidth - dragCoachWidthPx - viewportPaddingPx
      )
    );
    top = Math.max(viewportPaddingPx, cellRect.top - dragCoachVerticalOffsetPx);
    dragCoach.style.left = left + pixelUnit;
    dragCoach.style.top = top + pixelUnit;
    document.body.appendChild(dragCoach);
    this._dragCoachEl = dragCoach;
    this._dragCoachTimeout = setTimeout(this.clearDragCoach.bind(this), dragCoachAutoHideDelayMs);
  };

  WordSearchWidget.prototype.updateProgress = function () {
    var total = this._puzzle && Array.isArray(this._puzzle.items) ? this._puzzle.items.length : 0;
    var found = Object.keys(this._foundIds).length;
    if (this._wordSearchProgress) {
      this._wordSearchProgress.textContent = found + " of " + total + " found";
    }
  };

  WordSearchWidget.prototype.updateStatus = function (message) {
    if (this._statusEl) {
      this._statusEl.textContent = message || emptyString;
    }
  };

  WordSearchWidget.prototype.dispatchWidgetEvent = function (eventName, detail) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: detail }));
  };

  WordSearchWidget.prototype.emitCompletionIfNeeded = function (trigger) {
    if (this._completionEmitted || this._usedReveal || !this._puzzle) return;
    if (Object.keys(this._foundIds).length !== this._puzzle.items.length) return;
    this._completionEmitted = true;
    this.dispatchWidgetEvent("hecate:puzzle:completed", {
      trigger: trigger,
      usedHint: this._usedHint,
      usedReveal: false,
    });
  };

  WordSearchWidget.prototype.emitRevealIfNeeded = function () {
    if (this._usedReveal) return;
    this._usedReveal = true;
    this.dispatchWidgetEvent("hecate:puzzle:reveal-used", {
      usedHint: this._usedHint,
      usedReveal: true,
    });
  };

  WordSearchWidget.prototype.markPlacementFound = function (placement, isReveal) {
    var index;
    var vector;
    var key;
    var cell;
    var itemElement;

    if (!placement || this._foundIds[placement.id]) return;

    this._foundIds[placement.id] = true;
    vector = directionVector(placement.dir);
    for (index = 0; index < placement.word.length; index++) {
      key = cellKey(placement.row + vector.row * index, placement.col + vector.col * index);
      cell = this._cellsByKey[key];
      if (cell) {
        cell.classList.add(isReveal ? "word-search-cell--revealed" : "word-search-cell--found");
      }
    }

    itemElement = this._listById[placement.id];
    if (itemElement) {
      itemElement.classList.add("word-search-word--found");
    }

    this.updateProgress();
    this.emitCompletionIfNeeded(isReveal ? "reveal" : "selection");
  };

  WordSearchWidget.prototype.matchSelection = function (cells) {
    var placementIds = Object.keys(this._placementsById);
    var placementIndex;
    var placement;
    var matched = true;
    var index;
    var forwardRow;
    var forwardCol;
    var reverseRow;
    var reverseCol;
    var vector;

    for (placementIndex = 0; placementIndex < placementIds.length; placementIndex++) {
      placement = this._placementsById[placementIds[placementIndex]];
      if (this._foundIds[placement.id] || placement.word.length !== cells.length) continue;
      vector = directionVector(placement.dir);
      matched = true;

      for (index = 0; index < cells.length; index++) {
        forwardRow = placement.row + vector.row * index;
        forwardCol = placement.col + vector.col * index;
        if (cells[index].row !== forwardRow || cells[index].col !== forwardCol) {
          matched = false;
          break;
        }
      }
      if (matched) return placement;

      matched = true;
      for (index = 0; index < cells.length; index++) {
        reverseRow = placement.row + vector.row * (placement.word.length - 1 - index);
        reverseCol = placement.col + vector.col * (placement.word.length - 1 - index);
        if (cells[index].row !== reverseRow || cells[index].col !== reverseCol) {
          matched = false;
          break;
        }
      }
      if (matched) return placement;
    }

    return null;
  };

  WordSearchWidget.prototype.highlightSelection = function (cells) {
    var index;
    var cell;

    this.clearTransientSelection();
    for (index = 0; index < cells.length; index++) {
      cell = this._cellsByKey[cellKey(cells[index].row, cells[index].col)];
      if (cell) {
        cell.classList.add("word-search-cell--selected");
      }
    }
  };

  WordSearchWidget.prototype.finishSelection = function () {
    var cells;
    var placement;
    var cell;

    if (!this._selection) return;
    cells = selectionCells(
      this._selection.startRow,
      this._selection.startCol,
      this._selection.endRow,
      this._selection.endCol
    );
    if (cells.length === singleCellSelectionLength) {
      cell = this._cellsByKey[cellKey(cells[0].row, cells[0].col)];
      this.showDragCoach(cell);
    } else {
      placement = this.matchSelection(cells);
      if (placement) {
        this.markPlacementFound(placement, false);
        this.updateStatus("Found " + placement.word + ".");
      }
    }
    this.clearTransientSelection();
    this._selection = null;
  };

  WordSearchWidget.prototype.beginSelection = function (row, col) {
    this.clearDragCoach();
    this._selection = {
      startRow: row,
      startCol: col,
      endRow: row,
      endCol: col,
    };
    this.highlightSelection([{ row: row, col: col }]);
  };

  WordSearchWidget.prototype.moveSelection = function (row, col) {
    var cells;

    if (!this._selection) return;
    this._selection.endRow = row;
    this._selection.endCol = col;
    cells = selectionCells(this._selection.startRow, this._selection.startCol, row, col);
    this.highlightSelection(cells);
  };

  WordSearchWidget.prototype.resolveHintPlacement = function (entryIdentifier) {
    var itemIndex;
    var item;

    if (!this._puzzle || !Array.isArray(this._puzzle.items)) return null;
    if (typeof entryIdentifier === "string" && entryIdentifier) {
      return this._placementsById[entryIdentifier] || null;
    }
    for (itemIndex = 0; itemIndex < this._puzzle.items.length; itemIndex++) {
      item = this._puzzle.items[itemIndex];
      if (!this._foundIds[item.id]) {
        return this._placementsById[item.id] || null;
      }
    }
    return null;
  };

  WordSearchWidget.prototype.showHint = function (entryIdentifier) {
    var requestedEntryIdentifier = typeof entryIdentifier === "string" ? entryIdentifier : emptyString;
    var placement = this.resolveHintPlacement(requestedEntryIdentifier);
    var vector;
    var startCell;
    var nextCell;
    var hintMessage;
    var placementItem;

    if (!placement) {
      this.updateStatus(requestedEntryIdentifier ? hintUnavailableText : "All words are already found.");
      return;
    }

    this._usedHint = true;
    this.clearHintPulse();
    vector = directionVector(placement.dir);
    startCell = this._cellsByKey[cellKey(placement.row, placement.col)];
    nextCell = this._cellsByKey[cellKey(placement.row + vector.row, placement.col + vector.col)];
    if (startCell) {
      startCell.classList.add("word-search-cell--hinted");
    }
    if (nextCell) {
      nextCell.classList.add("word-search-cell--hinted");
    }
    placementItem = this._itemsById[placement.id] || {};
    hintMessage = placement.hint || placementItem.hint || hintUnavailableText;
    this.updateWordSearchHint(hintMessage);
    this._hintTimeout = setTimeout(this.clearHintPulse.bind(this), 1400);
    this.updateStatus("Hint shown for " + placement.word + ".");
  };

  WordSearchWidget.prototype.revealAll = function () {
    var placementIds = Object.keys(this._placementsById);
    var placementIndex;

    this.emitRevealIfNeeded();
    for (placementIndex = 0; placementIndex < placementIds.length; placementIndex++) {
      this.markPlacementFound(this._placementsById[placementIds[placementIndex]], true);
    }
    this.updateStatus("All words revealed.");
  };

  WordSearchWidget.prototype.render = function (puzzle) {
    var self = this;
    var rowIndex;
    var colIndex;
    var row;
    var cellButton;
    var itemIndex;
    var item;
    var wordItem;
    var wordLabel;
    var hintContainer;
    var hintButton;
    var hintText;
    var itemPlacement;
    var getTouchCell;

    this._puzzle = puzzle;
    this._cellsByKey = {};
    this._placementsById = {};
    this._itemsById = {};
    this._listById = {};
    this._selection = null;
    this._foundIds = {};
    this._usedHint = false;
    this._usedReveal = false;
    this._completionEmitted = false;
    this.clearHintPulse();
    this.clearDragCoach();
    this.ensureStandaloneElements();

    if (!puzzle || !Array.isArray(puzzle.grid) || !Array.isArray(puzzle.placements)) {
      if (this._errorBox) {
        this._errorBox.style.display = "block";
        this._errorBox.textContent = "Word search specification invalid";
      }
      return;
    }

    if (this._errorBox) {
      this._errorBox.style.display = hiddenStyleValue;
      this._errorBox.textContent = emptyString;
    }

    if (this._gridEl) {
      this._gridEl.innerHTML = "";
      this._gridEl.className = "grid word-search-grid";
      this._gridEl.style.gridTemplateColumns = "repeat(" + puzzle.size + ", var(--cell-size))";
      this._gridEl.style.gridTemplateRows = "repeat(" + puzzle.size + ", var(--cell-size))";
      this._currentColumnCount = Number(puzzle.size) || 0;
      if (typeof this.recalculate === "function") {
        this.recalculate();
      }
    }
    if (this._wordSearchList) {
      this._wordSearchList.innerHTML = "";
    }
    if (this._wordSearchPanel) {
      this._wordSearchPanel.hidden = false;
    }
    this.clearWordSearchHint();

    for (itemIndex = 0; itemIndex < puzzle.placements.length; itemIndex++) {
      this._placementsById[puzzle.placements[itemIndex].id] = puzzle.placements[itemIndex];
    }
    for (itemIndex = 0; itemIndex < puzzle.items.length; itemIndex++) {
      this._itemsById[puzzle.items[itemIndex].id] = puzzle.items[itemIndex];
    }

    for (rowIndex = 0; rowIndex < puzzle.grid.length; rowIndex++) {
      row = puzzle.grid[rowIndex];
      for (colIndex = 0; colIndex < row.length; colIndex++) {
        cellButton = document.createElement("button");
        cellButton.type = "button";
        cellButton.className = "word-search-cell";
        cellButton.textContent = row[colIndex];
        cellButton.dataset.row = String(rowIndex);
        cellButton.dataset.col = String(colIndex);
        cellButton.addEventListener("mousedown", function (event) {
          self.beginSelection(Number(event.currentTarget.dataset.row), Number(event.currentTarget.dataset.col));
        });
        cellButton.addEventListener("mouseenter", function (event) {
          self.moveSelection(Number(event.currentTarget.dataset.row), Number(event.currentTarget.dataset.col));
        });
        cellButton.addEventListener("mouseup", function () {
          self.finishSelection();
        });
        this._cellsByKey[cellKey(rowIndex, colIndex)] = cellButton;
        this._gridEl.appendChild(cellButton);
      }
    }

    if (this._gridViewport) {
      this._gridViewport.onmouseleave = this.finishSelection.bind(this);
    }

    getTouchCell = function (touch) {
      var element = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!element || !element.classList.contains("word-search-cell")) return null;
      return {
        row: Number(element.dataset.row),
        col: Number(element.dataset.col),
      };
    };

    if (this._gridViewport) {
      this._gridViewport.ontouchstart = function (event) {
        var target = getTouchCell(event.touches[0]);
        if (!target) return;
        self.beginSelection(target.row, target.col);
      };
      this._gridViewport.ontouchmove = function (event) {
        var target = getTouchCell(event.touches[0]);
        if (!target) return;
        self.moveSelection(target.row, target.col);
      };
      this._gridViewport.ontouchend = this.finishSelection.bind(this);
    }

    for (itemIndex = 0; itemIndex < puzzle.items.length; itemIndex++) {
      item = puzzle.items[itemIndex];
      wordItem = document.createElement("li");
      wordItem.className = "word-search-word";
      wordItem.setAttribute("data-word-search-word-id", item.id);
      wordLabel = document.createElement("span");
      wordLabel.className = "word-search-word__label";
      wordLabel.textContent = item.word;
      hintContainer = document.createElement("span");
      hintContainer.className = "hintControls";
      hintButton = document.createElement("button");
      hintButton.type = "button";
      hintButton.className = "hintButton";
      hintButton.textContent = hintButtonText;
      hintButton.setAttribute("aria-label", "Hint for " + item.word);
      hintText = document.createElement("div");
      hintText.className = "hintText";
      itemPlacement = this._placementsById[item.id] || {};
      hintText.textContent = itemPlacement.hint || item.hint || hintUnavailableText;
      hintText.style.display = hiddenStyleValue;
      (function (entryIdentifier, hintTextElement) {
        hintButton.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          self.showHint(entryIdentifier);
          hintTextElement.style.display = emptyString;
        });
      })(item.id, hintText);
      hintContainer.appendChild(hintButton);
      wordItem.appendChild(wordLabel);
      wordItem.appendChild(hintContainer);
      wordItem.appendChild(hintText);
      this._listById[item.id] = wordItem;
      this._wordSearchList.appendChild(wordItem);
    }

    this.updateProgress();
    this.updateStatus("");

    if (this._checkBtn) {
      this._checkBtn.textContent = "Hint";
      this._checkBtn.onclick = this.showHint.bind(this);
    }
    if (this._revealBtn) {
      this._revealBtn.textContent = "Reveal all";
      this._revealBtn.onclick = this.revealAll.bind(this);
    }
  };

  WordSearchWidget.__test = {
    cellKey: cellKey,
    directionVector: directionVector,
    selectionCells: selectionCells,
    computeBoundedCellSize: computeBoundedCellSize,
  };

  window.WordSearchWidget = WordSearchWidget;
})();
