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

// =========================
// 🔥 DAILY SYSTEM
// =========================
const DAILY_LIMIT = 1;

let gamesPlayedToday = parseInt(localStorage.getItem("gamesPlayedToday")) || 0;
let lastPlayedDate = localStorage.getItem("lastPlayedDate") || null;
let streak = parseInt(localStorage.getItem("streak")) || 0;

// ✅ NEW (correct streak tracking)
let lastCompletedDate = localStorage.getItem("lastCompletedDate") || null;

// =========================
// DATE HELPERS
// =========================
function getTodayString() {
  return new Date().toISOString().split("T")[0];
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

function getValidationError(word) {
  if (!validWordSet.has(word)) return "Not a valid word.";
  if (usedWords.has(word)) return "Word already used.";
  if (isPluralVariant(word)) return "Plural variation not allowed.";
  if (word.length < MIN_WORD_LENGTH) return `Must be at least ${MIN_WORD_LENGTH} letters.`;
  if (usedLetterCounts.has(word.length)) return `Length ${word.length} already used.`;
  if (word[0] !== currentWord.slice(-1)) {
    return `Must start with '${currentWord.slice(-1)}'.`;
  }

  return null;
}

// =========================
// VALID WORD HELPERS
// =========================
function getAllValidNextWords() {
  return validWords.filter(word => isValidNextWord(word));
}

function getRandomValidWord() {
  const valid = getAllValidNextWords();
  if (valid.length === 0) return null;
  return valid[Math.floor(Math.random() * valid.length)];
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

  currentWord = validWords[Math.floor(Math.random() * validWords.length)];
  usedWords.add(currentWord);

  updateUI();
  renderChain();

  if (gamesPlayedToday >= DAILY_LIMIT) {
    setFeedback("Daily runs complete — practice mode only.");
  } else {
    setFeedback(`Start: ${currentWord}`);
  }

  document.getElementById("hintDisplay").textContent = "";
  document.getElementById("hintCount").textContent = hintUsedThisGame;

  const input = document.getElementById("wordInput");
  input.value = "";
  input.focus();
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

  if (streakEl) streakEl.textContent = streak;
  if (dailyEl) dailyEl.textContent = `${gamesPlayedToday}/${DAILY_LIMIT}`;

  updateActiveLetter();
  updateInputPlaceholder();
}

// =========================
// HINT
// =========================
function handleHint() {
  const validOptions = getAllValidNextWords();

  if (!currentHintWord) {
    if (validOptions.length === 0) {
      setFeedback("No valid hints available.", true);
      return;
    }

    currentHintWord = validOptions[Math.floor(Math.random() * validOptions.length)];
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
  const input = document.getElementById("wordInput");
  const word = normalizeWord(input.value);

  if (!word) return;

  const error = getValidationError(word);

  if (error) {
    setFeedback(error, true);
    return;
  }

  usedWords.add(word);
  usedLetterCounts.add(word.length);
  wordChain.push(word);

  currentWord = word;
  score++;

  currentHintWord = null;
  revealedLetters = 0;
  document.getElementById("hintDisplay").textContent = "";

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
  if (getAllValidNextWords().length === 0) {
    setTimeout(() => {
      setFeedback("No valid moves remain — round over.");
      finalizeGame();
    }, 400);
  }
}

// =========================
// END GAME
// =========================
function endGame() {
  const suggestion = getRandomValidWord();

  let message = `Game Over — Score: ${score}`;
  if (suggestion) message += ` | Try: ${suggestion}`;

  setFeedback(message);
  finalizeGame();
}

// =========================
// FINALIZE GAME (FIXED)
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

  setTimeout(() => startGame(), 3400);
}

// =========================
// RESET
// =========================
function resetGame() {
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

// =========================
// INIT
// =========================
loadWords();