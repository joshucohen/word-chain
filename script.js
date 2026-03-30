// =========================
// GLOBAL STATE
// =========================
let validWords = [];
let validWordSet = new Set();
let usedWords = new Set();
let usedLetterCounts = new Set();
let wordChain = [];

let currentWord = "";
let score = 0;

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
function getTodayString() {
  return new Date().toISOString().split("T")[0];
}

function getDisplayDateString() {
  return new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
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

  const grouped = {};
  candidates.forEach(word => {
    const len = word.length;
    if (!grouped[len]) grouped[len] = [];
    grouped[len].push(word);
  });

  const sortedLengths = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  const bestLength = sortedLengths[0];
  return grouped[bestLength][0];
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
      // user cancelled share
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
function openEndModal(suggestion) {
  const modal = document.getElementById("endModal");
  const overlay = document.getElementById("endModalOverlay");
  const scoreEl = document.getElementById("endScore");
  const hintsEl = document.getElementById("endHints");
  const suggestionEl = document.getElementById("endSuggestion");
  const blocksEl = document.getElementById("endBlocks");

  if (!modal || !overlay) return;

  if (scoreEl) scoreEl.textContent = score;
  if (hintsEl) hintsEl.textContent = hintUsedThisGame;
  if (suggestionEl) suggestionEl.textContent = suggestion || "No valid move remained";
  if (blocksEl) blocksEl.innerHTML = [...Array(score)]
    .map(() => "<span></span>")
    .join("");

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

  checkDailyReset();
  startGame();
}

// =========================
// START GAME
// =========================
function startGame() {
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

  if (gamesPlayedToday < DAILY_LIMIT) {
    const seed = getDailySeed();
    const index = seed % validWords.length;
    currentWord = validWords[index];
  } else {
    currentWord = validWords[Math.floor(Math.random() * validWords.length)];
  }

  usedWords.add(currentWord);

  updateUI();
  renderChain();

  if (gamesPlayedToday >= DAILY_LIMIT) {
    setFeedback("Daily runs complete — practice mode only.");
  } else {
    setFeedback(`Start: ${currentWord}`);
  }

  const hintCountEl = document.getElementById("hintCount");
  if (hintCountEl) hintCountEl.textContent = hintUsedThisGame;

  const input = document.getElementById("wordInput");
  input.value = "";
  input.focus();
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
  finalizeGame();
  openEndModal(suggestion);
}

// =========================
// FINALIZE GAME
// =========================
function finalizeGame() {
  const today = getTodayString();

  if (gamesPlayedToday < DAILY_LIMIT) {
    gamesPlayedToday++;
    localStorage.setItem("gamesPlayedToday", gamesPlayedToday);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split("T")[0];

    if (lastCompletedDate === yStr) {
      streak++;
    } else if (lastCompletedDate !== today) {
      streak = 1;
    }

    localStorage.setItem("streak", streak);
    localStorage.setItem("lastCompletedDate", today);

    lastCompletedDate = today;
  }

  if (
    score > highScore ||
    (score === highScore && hintUsedThisGame < highScoreHints)
  ) {
    highScore = score;
    highScoreHints = hintUsedThisGame;

    localStorage.setItem("wordGameHighScore", highScore);
    localStorage.setItem("wordGameHighScoreHints", highScoreHints);
  }

  updateUI();
  gameOverPendingReset = true;
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