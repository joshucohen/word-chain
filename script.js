// =========================
// GLOBAL STATE
// =========================
let validWords = [];
let validWordSet = new Set();
let commonWords = [];
let commonWordSet = new Set();
let usedWords = new Set();
let usedLetterCounts = new Set();
let wordChain = [];

let currentWord = "";
let score = 0;

let letterCountTimeout = null;

// GAME MODE
let isDailyGame = false;

// HINT SYSTEM
let hintUsedThisGame = 0;
let hintWordsUsed = [];

let currentHintWord = null;
let revealedLetters = 0;

// HIGH SCORE
let highScore = parseInt(localStorage.getItem("wordGameHighScore")) || 0;
let highScoreHints = parseInt(localStorage.getItem("wordGameHighScoreHints")) || 0;

const MIN_WORD_LENGTH = 3;
const GAME_URL = "https://play-wordchain.com/";
const GAME_TIMEZONE = "America/New_York";

// =========================
// DAILY SYSTEM
// =========================
const DAILY_LIMIT = 1;

let gamesPlayedToday = parseInt(localStorage.getItem("gamesPlayedToday")) || 0;
let lastPlayedDate = localStorage.getItem("lastPlayedDate") || null;
let streak = parseInt(localStorage.getItem("streak")) || 0;
let lastCompletedDate = localStorage.getItem("lastCompletedDate") || null;

// =========================
// MODAL / GAME FLOW STATE
// =========================
let gameOverPendingReset = false;

// =========================
// DATE HELPERS
// =========================
function getTimeZoneDateParts(date = new Date(), timeZone = GAME_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  parts.forEach(part => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  });

  return {
    year: values.year,
    month: values.month,
    day: values.day
  };
}

function getTodayString() {
  const { year, month, day } = getTimeZoneDateParts();
  return `${year}-${month}-${day}`;
}

function getDisplayDateString() {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: GAME_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date());
}

function getYesterdayString(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() - 1);

  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utcDate.getUTCDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function checkDailyReset() {
  const today = getTodayString();

  if (lastPlayedDate !== today) {
    gamesPlayedToday = 0;
    localStorage.setItem("gamesPlayedToday", 0);
    lastPlayedDate = today;
    localStorage.setItem("lastPlayedDate", today);
  }
}

// =========================
// DAILY SEED
// =========================
function getDailySeed() {
  const today = getTodayString();
  let hash = 0;

  for (let i = 0; i < today.length; i++) {
    hash = today.charCodeAt(i) + ((hash << 5) - hash);
  }

  return Math.abs(hash);
}

// =========================
// NORMALIZE WORD
// =========================
function normalizeWord(word) {
  return word.trim().toLowerCase().replace(/[^a-z]/g, "");
}

// =========================
// PLURAL CHECK
// =========================
function isPluralVariant(word) {
  if (usedWords.has(word)) return true;

  if (word.endsWith("s")) {
    const singular = word.slice(0, -1);
    if (usedWords.has(singular)) return true;
  } else {
    const plural = word + "s";
    if (usedWords.has(plural)) return true;
  }

  return false;
}

// =========================
// VALIDATION
// =========================
function isValidNextWord(word) {
  return (
    validWordSet.has(word) &&
    !usedWords.has(word) &&
    !isPluralVariant(word) &&
    word.length >= MIN_WORD_LENGTH &&
    !usedLetterCounts.has(word.length) &&
    word[0] === currentWord.slice(-1)
  );
}

// =========================
// BEST WORD LOGIC
// =========================
function getBestNextWord() {
  const lastLetter = currentWord.slice(-1);

  const candidates = validWords.filter(word => {
    return (
      word.startsWith(lastLetter) &&
      !usedWords.has(word) &&
      !isPluralVariant(word) &&
      word.length >= MIN_WORD_LENGTH &&
      !usedLetterCounts.has(word.length)
    );
  });

  if (candidates.length === 0) return null;

  // 🔥 Split into common vs non-common
  const commonCandidates = candidates.filter(word => commonWordSet.has(word));

  // 🔥 If we have common words, use them
  const pool = commonCandidates.length > 0 ? commonCandidates : candidates;

  // 🔥 From chosen pool, pick shortest length
  let bestWord = null;
  let bestLength = Infinity;

  for (let i = 0; i < pool.length; i++) {
    const word = pool[i];
    if (word.length < bestLength) {
      bestLength = word.length;
      bestWord = word;
    }
  }

  return bestWord;
}
// =========================
// SHARE
// =========================
function generateShareBlocks() {
  if (score <= 0) return "⬜";
  return "🟦".repeat(score);
}

function generateShareText() {
  const dateText = getDisplayDateString();
  const blocks = generateShareBlocks();

  return [
    `${dateText}`,
    `Score: ${score} | Hints: ${hintUsedThisGame}`,
    blocks,
    "",
    "Can you beat my score?",
    GAME_URL
  ].join("\n");
}

async function handleShare() {
  const text = generateShareText();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Word Chain",
        text
      });
    } catch (err) {
      // user cancelled
    }
  } else {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback("Results copied to clipboard.");
    } catch (err) {
      setFeedback("Could not copy results.", true);
    }
  }
}

// =========================
// MODAL HELPERS
// =========================
function ensureEndModalExtras() {
  const modal = document.getElementById("endModal");
  if (!modal) return {};

  let modeEl = document.getElementById("endMode");
  let messageEl = document.getElementById("endMessage");
  let bestEl = document.getElementById("endBestMessage");

  if (!modeEl) {
    modeEl = document.createElement("p");
    modeEl.id = "endMode";
    modeEl.style.margin = "0 0 10px 0";
    modeEl.style.fontSize = "0.95rem";
    modeEl.style.opacity = "0.8";

    const heading = modal.querySelector("h2");
    if (heading && heading.parentNode) {
      heading.parentNode.insertBefore(modeEl, heading.nextSibling);
    }
  }

  if (!messageEl) {
    messageEl = document.createElement("p");
    messageEl.id = "endMessage";
    messageEl.style.margin = "14px 0 8px 0";
    messageEl.style.fontWeight = "600";
    messageEl.style.lineHeight = "1.4";

    const stats = modal.querySelector(".modal-stats");
    if (stats && stats.parentNode) {
      stats.parentNode.insertBefore(messageEl, stats.nextSibling);
    }
  }

  if (!bestEl) {
    bestEl = document.createElement("p");
    bestEl.id = "endBestMessage";
    bestEl.style.margin = "0 0 14px 0";
    bestEl.style.fontSize = "0.95rem";
    bestEl.style.opacity = "0.85";

    if (messageEl && messageEl.parentNode) {
      messageEl.parentNode.insertBefore(bestEl, messageEl.nextSibling);
    }
  }

  return { modeEl, messageEl, bestEl };
}

function openEndModal(suggestion, modalData = {}) {
  const modal = document.getElementById("endModal");
  const overlay = document.getElementById("endModalOverlay");
  const scoreEl = document.getElementById("endScore");
  const hintsEl = document.getElementById("endHints");
  const suggestionEl = document.getElementById("endSuggestion");
  const blocksEl = document.getElementById("endBlocks");

  if (!modal || !overlay) return;

  const heading = modal.querySelector("h2");
  const { modeEl, messageEl, bestEl } = ensureEndModalExtras();

  if (heading) {
    heading.textContent = modalData.title || "Game Over";
  }

  if (modeEl) {
    modeEl.textContent = modalData.modeLabel || "";
  }

  if (messageEl) {
    messageEl.textContent = modalData.message || "";
  }

  if (bestEl) {
    bestEl.textContent = modalData.bestMessage || "";
  }

  if (scoreEl) scoreEl.textContent = score;
  if (hintsEl) hintsEl.textContent = hintUsedThisGame;
  if (suggestionEl) suggestionEl.textContent = suggestion || "No valid move remained";
  if (blocksEl) {
    blocksEl.innerHTML = [...Array(score)]
      .map(() => "<span></span>")
      .join("");
  }

  overlay.classList.remove("hidden");
  modal.classList.remove("hidden");
}

function closeEndModal() {
  const modal = document.getElementById("endModal");
  const overlay = document.getElementById("endModalOverlay");

  if (modal) modal.classList.add("hidden");
  if (overlay) overlay.classList.add("hidden");

  if (gameOverPendingReset) {
    gameOverPendingReset = false;
    startGame();
  }
}

// =========================
// LOAD WORDS
// =========================
async function loadWords() {
  const res = await fetch("words.txt");
  const text = await res.text();

  validWords = text
    .split("\n")
    .map(w => normalizeWord(w))
    .filter(w => w.length >= MIN_WORD_LENGTH);

  validWordSet = new Set(validWords);

  // LOAD COMMON WORDS (frequency-ranked)
try {
  const commonRes = await fetch("common_words.txt");
  const commonText = await commonRes.text();

  commonWords = commonText
    .split("\n")
    .map(w => normalizeWord(w))
    .filter(w => w.length >= MIN_WORD_LENGTH);

  commonWordSet = new Set(commonWords);
} catch (err) {
  console.warn("Could not load common_words.txt", err);
}

  checkDailyReset();
  startGame();
}

// =========================
// START GAME
// =========================
function startGame() {
  checkDailyReset();

  usedWords.clear();
  usedLetterCounts.clear();
  wordChain = [];
  score = 0;

  hintUsedThisGame = 0;
  hintWordsUsed = [];
  currentHintWord = null;
  revealedLetters = 0;

  const hintDisplay = document.getElementById("hintDisplay");
  if (hintDisplay) hintDisplay.textContent = "";

  closeModalIfOpenOnly();

  isDailyGame = gamesPlayedToday < DAILY_LIMIT;

  if (isDailyGame) {
    const seed = getDailySeed();
    const index = seed % validWords.length;
    currentWord = validWords[index];
  } else {
    currentWord = validWords[Math.floor(Math.random() * validWords.length)];
  }

  usedWords.add(currentWord);

  updateUI();
  renderChain();

  if (isDailyGame) {
    setFeedback(`Start: ${currentWord}`);
  } else {
    setFeedback("Daily run complete — practice mode only.");
  }

  const hintCountEl = document.getElementById("hintCount");
  if (hintCountEl) hintCountEl.textContent = hintUsedThisGame;

  const input = document.getElementById("wordInput");
  if (input) {
    input.value = "";
    input.focus();
    setTimeout(updateLetterCount, 0);
  }
}

function closeModalIfOpenOnly() {
  const modal = document.getElementById("endModal");
  const overlay = document.getElementById("endModalOverlay");

  if (modal) modal.classList.add("hidden");
  if (overlay) overlay.classList.add("hidden");
}

// =========================
// UI
// =========================
function updateActiveLetter() {
  const letter = currentWord.slice(-1);
  document.getElementById("currentWord").innerHTML = `
    <span class="label">Current</span>
    <span class="word">${currentWord}</span>
    <span class="next-letter">→ ${letter.toUpperCase()}</span>
  `;
}

function updateInputPlaceholder() {
  const input = document.getElementById("wordInput");
  const nextLetter = currentWord.slice(-1);
  input.placeholder = `Enter a word starting with '${nextLetter.toUpperCase()}'`;
}

function updateUI() {
  document.getElementById("score").textContent = score;
  document.getElementById("highScore").textContent = highScore;
  document.getElementById("highScoreHints").textContent = highScoreHints;

  const streakEl = document.getElementById("streak");
  const dailyEl = document.getElementById("dailyCount");
  const hintCountEl = document.getElementById("hintCount");

  if (streakEl) streakEl.textContent = streak;
  if (dailyEl) dailyEl.textContent = `${gamesPlayedToday}/${DAILY_LIMIT}`;
  if (hintCountEl) hintCountEl.textContent = hintUsedThisGame;

  updateActiveLetter();
  updateInputPlaceholder();
}

function updateLetterCount() {
  const input = document.getElementById("wordInput");
  const display = document.getElementById("letterCount");

  if (!input || !display) return;

  const raw = input.value;
  const word = normalizeWord(raw);
  const length = word.length;

  display.textContent = `${length} letters`;

  // 1. Too short
  if (length < MIN_WORD_LENGTH) {
    display.style.color = "#6b7280";
    display.style.boxShadow = "none";
    return;
  }

  // 2. Used length (hard fail - always red)
  if (usedLetterCounts.has(length)) {
    display.style.color = "#ef4444";
    display.style.boxShadow = "0 0 8px rgba(239,68,68,0.4)";
    return;
  }

  // 3. Valid word
  if (validWordSet.has(word)) {
    display.style.color = "#22c55e";
    display.style.boxShadow = "0 0 8px rgba(34,197,94,0.4)";
    return;
  }

  // 4. Otherwise → neutral while typing
  display.style.color = "#9ca3af";
  display.style.boxShadow = "none";
}

function finalizeLetterCount() {
  const input = document.getElementById("wordInput");
  const display = document.getElementById("letterCount");

  if (!input || !display) return;

  const word = normalizeWord(input.value);
  const length = word.length;

  if (length < MIN_WORD_LENGTH) return;
  if (usedLetterCounts.has(length)) return;
  if (validWordSet.has(word)) return;

  // Now it's truly invalid → orange
  display.style.color = "#f97316";
  display.style.boxShadow = "0 0 8px rgba(249,115,22,0.4)";
}

// =========================
// HINT
// =========================
function handleHint() {
  if (gameOverPendingReset) return;

  if (!currentHintWord) {
    currentHintWord = getBestNextWord();

    if (!currentHintWord) {
      setFeedback("No valid hints available.", true);
      return;
    }

    revealedLetters = 2;
    hintWordsUsed.push(currentHintWord);
  } else {
    revealedLetters++;
  }

  const maxReveal = Math.ceil(currentHintWord.length / 2);

  if (revealedLetters > maxReveal) {
    setFeedback("Out of hints for this word");
    return;
  }

  hintUsedThisGame++;

  const visible = currentHintWord.slice(0, revealedLetters);
  const hidden = "_ ".repeat(currentHintWord.length - revealedLetters).trim();

  document.getElementById("hintDisplay").textContent = visible + " " + hidden;
  document.getElementById("hintCount").textContent = hintUsedThisGame;

  setFeedback("Hint used");
  document.getElementById("wordInput").focus();
}

// =========================
// RENDER
// =========================
function renderChain() {
  const container = document.getElementById("wordChain");

  if (wordChain.length === 0) {
    container.innerHTML = `<span class="chain-empty">No words played yet.</span>`;
    return;
  }

  const sorted = [...wordChain].sort((a, b) => a.length - b.length);

  container.innerHTML = sorted.map(word => `
    <span class="chain-word">
      ${word}
      <span class="letter-count">${word.length}</span>
    </span>
  `).join("");
}

// =========================
// FEEDBACK
// =========================
function setFeedback(msg, isError = false) {
  const el = document.getElementById("feedback");
  el.textContent = msg;
  el.style.color = isError ? "#ef4444" : "#66fcf1";
}

// =========================
// GAME LOGIC
// =========================
function handleSubmit() {
  if (gameOverPendingReset) return;

  const input = document.getElementById("wordInput");
  const word = normalizeWord(input.value);

  if (!word) return;

  if (!isValidNextWord(word)) {
    let reason = "";

    if (!validWordSet.has(word)) {
      reason = "Not a valid word.";
    } else if (usedWords.has(word)) {
      reason = "Word already used.";
    } else if (isPluralVariant(word)) {
      reason = "No plural variants allowed.";
    } else if (word.length < MIN_WORD_LENGTH) {
      reason = "Minimum 3 letters.";
    } else if (usedLetterCounts.has(word.length)) {
      reason = "Word length already used.";
    } else if (word[0] !== currentWord.slice(-1)) {
      reason = `Must start with '${currentWord.slice(-1).toUpperCase()}'`;
    } else {
      reason = "Invalid move.";
    }

    setFeedback(reason, true);
    return;
  }

  usedWords.add(word);
  usedLetterCounts.add(word.length);
  wordChain.push(word);

  currentWord = word;
  score++;

  currentHintWord = null;
  revealedLetters = 0;

  const hintDisplay = document.getElementById("hintDisplay");
  if (hintDisplay) hintDisplay.textContent = "";

  updateUI();
  renderChain();

  setFeedback("+1");

  input.value = "";
  updateLetterCount();
  input.focus();

  checkForNoMoves();
}

// =========================
// END CHECK
// =========================
function checkForNoMoves() {
  if (!getBestNextWord()) {
    setTimeout(() => {
      setFeedback("No valid moves remain.");
      endRound();
    }, 400);
  }
}

// =========================
// END GAME
// =========================
function endGame() {
  if (gameOverPendingReset) return;
  endRound();
}

function endRound() {
  const suggestion = getBestNextWord();
  const modalData = finalizeGame();
  openEndModal(suggestion, modalData);
}

// =========================
// FINALIZE GAME
// =========================
function finalizeGame() {
  const today = getTodayString();
  const wasDailyGame = isDailyGame;
  const wordLabel = highScore === 1 ? "word" : "words";
  const hintLabel = highScoreHints === 1 ? "hint" : "hints";

  const beatsOfficialScore = score > highScore;
  const tiesOfficialScore = score === highScore;
  const beatsOfficialHintsOnTie =
    tiesOfficialScore && score > 0 && hintUsedThisGame < highScoreHints;
  const isOfficialImprovement = beatsOfficialScore || beatsOfficialHintsOnTie;

  let modalData = {
    title: "Game Over",
    modeLabel: "", // default empty
    message: "",
    bestMessage: `Official best: ${highScore} ${wordLabel}, ${highScoreHints} ${hintLabel}`
  };
  
  // Only show mode label when it's actually useful
  if (wasDailyGame) {
    modalData.modeLabel = "Daily Game";
  }

  if (wasDailyGame) {
    gamesPlayedToday++;
    localStorage.setItem("gamesPlayedToday", gamesPlayedToday);

    const yesterday = getYesterdayString(today);

    if (lastCompletedDate === yesterday) {
      streak++;
    } else if (lastCompletedDate !== today) {
      streak = 1;
    }

    localStorage.setItem("streak", streak);
    localStorage.setItem("lastCompletedDate", today);
    lastCompletedDate = today;

    if (isOfficialImprovement) {
      highScore = score;
      highScoreHints = hintUsedThisGame;

      localStorage.setItem("wordGameHighScore", highScore);
      localStorage.setItem("wordGameHighScoreHints", highScoreHints);

      modalData.title = "New High Score";
      modalData.message = `That is your new official best.`;
      const newWordLabel = highScore === 1 ? "word" : "words";
      const newHintLabel = highScoreHints === 1 ? "hint" : "hints";

      modalData.bestMessage = `Official best: ${highScore} ${newWordLabel}, ${highScoreHints} ${newHintLabel}`;


    } else {
      modalData.message = "Daily run complete.";
      modalData.bestMessage = `Official best remains ${highScore} ${wordLabel}, ${highScoreHints} ${hintLabel}`;
    }
  } else {
    if (beatsOfficialScore) {
      modalData.title = "Practice Personal Best";
      modalData.message =
        "New personal best (practice). Come back tomorrow to make it count.";
        modalData.bestMessage = `Official best: ${highScore} ${wordLabel}, ${highScoreHints} ${hintLabel}`;
    } else if (beatsOfficialHintsOnTie) {
      modalData.title = "Practice Efficiency Best";
      modalData.message =
        "You matched your best score with fewer hints in practice. Nice work. Come back tomorrow to make it count.";
        modalData.bestMessage = `Official best remains ${highScore} ${wordLabel}, ${highScoreHints} ${hintLabel}`;
    } else {
      modalData.message = "Practice run complete.";
      modalData.bestMessage = `Official best: ${highScore} ${wordLabel}, ${highScoreHints} ${hintLabel}`;
    }
  }

  updateUI();
  gameOverPendingReset = true;

  return modalData;
}

// =========================
// RESET
// =========================
function resetGame() {
  gameOverPendingReset = false;
  startGame();
  setFeedback("Game reset.");
}

// =========================
// EVENTS
// =========================
document.getElementById("submitBtn").addEventListener("click", handleSubmit);
document.getElementById("resetBtn").addEventListener("click", resetGame);
document.getElementById("endGameBtn").addEventListener("click", endGame);
document.getElementById("hintBtn").addEventListener("click", handleHint);

document.getElementById("wordInput").addEventListener("keypress", e => {
  if (e.key === "Enter") handleSubmit();
});
const inputEl = document.getElementById("wordInput");

inputEl.addEventListener("input", () => {
  updateLetterCount();

  if (letterCountTimeout) {
    clearTimeout(letterCountTimeout);
  }

  letterCountTimeout = setTimeout(() => {
    finalizeLetterCount();
  }, 400);
});

inputEl.addEventListener("blur", finalizeLetterCount);

const modalShareBtn = document.getElementById("modalShareBtn");
if (modalShareBtn) {
  modalShareBtn.addEventListener("click", handleShare);
}

const modalCloseBtn = document.getElementById("modalCloseBtn");
if (modalCloseBtn) {
  modalCloseBtn.addEventListener("click", closeEndModal);
}

const modalOverlay = document.getElementById("endModalOverlay");
if (modalOverlay) {
  modalOverlay.addEventListener("click", closeEndModal);
}

// =========================
// INIT
// =========================
loadWords();