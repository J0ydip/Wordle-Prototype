/* --- 1. THE "BRAIN" (Unchanged) --- */
class WordleSolver {
    // ... (Your entire, unchanged WordleSolver class) ...
    constructor(possibleAnswers, allowedGuesses) {
        this.possibleAnswers = possibleAnswers;
        this.allowedGuesses = allowedGuesses;
        this.reset();
    }
    reset() {
        this.remainingAnswers = [...this.possibleAnswers];
    }
    getPattern(guess, answer) {
        const pattern = Array(5).fill('b');
        const answerChars = answer.split('');
        const guessChars = guess.split('');
        const answerCounts = {};
        answerChars.forEach(c => answerCounts[c] = (answerCounts[c] || 0) + 1);
        for (let i = 0; i < 5; i++) {
            if (guessChars[i] === answerChars[i]) {
                pattern[i] = 'g';
                answerCounts[guessChars[i]]--;
            }
        }
        for (let i = 0; i < 5; i++) {
            if (pattern[i] === 'g') continue;
            const char = guessChars[i];
            if (answerChars.includes(char) && answerCounts[char] > 0) {
                pattern[i] = 'y';
                answerCounts[char]--;
            }
        }
        return pattern.join('');
    }
    filterWords(guess, pattern) {
        this.remainingAnswers = this.remainingAnswers.filter(answer => {
            return this.getPattern(guess, answer) === pattern;
        });
    }
    calculateEntropies(topN = 10) {
        const candidates = (this.remainingAnswers.length === 1 || this.remainingAnswers.length === 2) 
            ? this.remainingAnswers 
            : this.allowedGuesses;
        const entropies = candidates.map(guess => {
            const patternCounts = {};
            for (const answer of this.remainingAnswers) {
                const pattern = this.getPattern(guess, answer);
                patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
            }
            let entropy = 0;
            const total = this.remainingAnswers.length;
            if (total > 0) {
                for (const count of Object.values(patternCounts)) {
                    const p = count / total;
                    if (p > 0) {
                        entropy -= p * Math.log2(p);
                    }
                }
            }
            const isPossibleAnswer = this.remainingAnswers.includes(guess);
            return { word: guess, entropy, isPossibleAnswer };
        });
        entropies.sort((a, b) => {
            if (b.entropy !== a.entropy) {
                return b.entropy - a.entropy;
            }
            return b.isPossibleAnswer - a.isPossibleAnswer;
        });
        return entropies.slice(0, topN);
    }
}


/* --- 2. THE "BRIDGE" (UI LOGIC) --- */
let solver;
let guesses = []; 
let currentPattern = ['n', 'n', 'n', 'n', 'n']; 
const MAX_GUESSES = 6;

// Cache DOM elements
const guessInput = document.getElementById('guessInput');
const recommendationsList = document.getElementById('recommendationsList');
const historyGrid = document.getElementById('game-board-grid');
const patternButtons = document.querySelectorAll('.pattern-btn');
const themeToggle = document.getElementById('theme-toggle');
const loader = document.getElementById('loader'); 
const loaderMessage = document.getElementById('loader-message');
const toast = document.getElementById('toast-notification');
const toastMessage = document.getElementById('toast-message');

const topPicksCard = document.getElementById('top-picks-card');
const solutionContainer = document.getElementById('solution-container');
const solutionWord = document.getElementById('solution-word');

// Stats elements
const statTurn = document.getElementById('stat-turn');
const statPossibleWords = document.getElementById('stat-possible-words');
const statUncertainty = document.getElementById('stat-uncertainty');


/* --- 3. THEME TOGGLE LOGIC --- */
function setInitialTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);
}
themeToggle.addEventListener('click', () => {
    let currentTheme = document.body.getAttribute('data-theme');
    let newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});


/* --- 4. CORE UI FUNCTIONS --- */

function hideLoader() {
    loader.classList.add('hidden');
}

let toastTimer;
function showToast(message, isError = false) { // ADDED: isError flag
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastMessage.textContent = message;
    toast.classList.remove('error'); // Ensure error class is removed first
    
    if (isError) {
        toast.classList.add('error');
        toastMessage.style.color = '#fff'; // White text for visibility on red background
        toast.style.backgroundColor = '#cc0000'; // Red background
    } else {
        // Reset to default success colors
        toast.style.backgroundColor = '';
        toastMessage.style.color = 'var(--color-accent)';
    }

    toast.classList.add('show');
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

function createHistoryGrid() {
    historyGrid.innerHTML = '';
    for (let i = 0; i < 30; i++) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        historyGrid.appendChild(tile);
    }
}

function updateGuessesHistory() {
    const allTiles = historyGrid.children;
    for (let i = 0; i < MAX_GUESSES * 5; i++) {
        allTiles[i].textContent = '';
        allTiles[i].className = 'tile';
    }
    guesses.forEach((guess, guessIndex) => {
        const row = guessIndex;
        for (let i = 0; i < 5; i++) {
            const tileIndex = row * 5 + i;
            if (tileIndex < 30) { 
                const letter = guess.word[i];
                const state = guess.pattern[i];
                allTiles[tileIndex].textContent = letter;
                const colorClass = state === 'g' ? 'green' : state === 'y' ? 'yellow' : 'gray';
                allTiles[tileIndex].className = `tile ${colorClass}`;
            }
        }
    });
}

function updatePatternButtons() {
    patternButtons.forEach((btn, index) => {
        btn.className = 'pattern-btn'; 
        const state = currentPattern[index];
        if (state === 'g') btn.classList.add('green');
        else if (state === 'y') btn.classList.add('yellow');
        else if (state === 'b') btn.classList.add('gray');
    });
}

function updateGameStats() {
    const possible = solver.remainingAnswers.length;
    let uncertainty = 0.00;
    
    if (possible > 0) {
        uncertainty = Math.log2(possible).toFixed(2);
    }
    
    statTurn.textContent = guesses.length + 1;
    statPossibleWords.textContent = possible;
    statUncertainty.textContent = uncertainty;
}

// MODIFIED: Added logic to trigger the error toast
function calculateRecommendations(count = 10) {
    if (!solver) return;
    
    const recommendations = solver.calculateEntropies(count); 
    recommendationsList.innerHTML = ''; 
    const possibleCount = solver.remainingAnswers.length;

    if (possibleCount === 1) {
        solutionWord.textContent = solver.remainingAnswers[0];
        solutionContainer.classList.add('show');
        topPicksCard.classList.add('hidden');
        updateGameStats();
        return; 
    }
    
    solutionContainer.classList.remove('show');
    topPicksCard.classList.remove('hidden');

    if (recommendations.length === 0 || (recommendations[0] && recommendations[0].entropy === 0)) {
        if (possibleCount === 0) {
            // --- NEW: Trigger error alert and display message in sidebar ---
            showToast("No possible answers remain. The word might not be in the dictionary.", true);
            recommendationsList.innerHTML = `<div class="empty-state solved-message">No Solutions Found</div>`;
        } else {
            recommendationsList.innerHTML = `<div class="empty-state">No recommendations found.</div>`;
        }
        return;
    }

    recommendations.forEach(rec => {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';
        if (rec.isPossibleAnswer) {
            wordItem.classList.add('is-answer');
        }
        const prob = (rec.isPossibleAnswer && possibleCount > 0) ? (1 / possibleCount).toFixed(4) : '0.0000';
        wordItem.innerHTML = `
            <span class="word">${rec.word}</span>
            <span class="entropy">${rec.entropy.toFixed(2)}</span>
            <span class="prob">${prob}</span>
        `;
        wordItem.addEventListener('click', () => {
            selectWord(rec.word);
        });
        recommendationsList.appendChild(wordItem);
    });
}

function clearPreviewTiles() {
    const previewTiles = document.querySelectorAll('.tile.preview');
    previewTiles.forEach(tile => {
        tile.textContent = '';
        tile.classList.remove('preview');
    });
}
function showPreviewInBoard(word) {
    clearPreviewTiles();
    const currentRow = guesses.length;
    if (currentRow >= MAX_GUESSES) return;
    const allTiles = historyGrid.children;
    for (let i = 0; i < 5; i++) {
        const tileIndex = currentRow * 5 + i;
        if (allTiles[tileIndex]) {
            allTiles[tileIndex].textContent = word[i];
            allTiles[tileIndex].classList.add('preview');
        }
    }
}
function selectWord(word) {
    guessInput.value = word;
    guessInput.focus();
    showPreviewInBoard(word);
}

async function resetSolver() {
    guesses = [];
    currentPattern = ['n', 'n', 'n', 'n', 'n']; 
    guessInput.value = '';
    
    updateGuessesHistory(); 
    updatePatternButtons();
    
    solutionContainer.classList.remove('show');
    topPicksCard.classList.remove('hidden');
    recommendationsList.innerHTML = `<div class="empty-state">Calculating...</div>`;
    
    if (solver) {
        solver.reset();
        updateGameStats(); 
        
        await new Promise(resolve => setTimeout(resolve, 20)); 
        
        calculateRecommendations(10);
        showToast("Solver reset! Ready for a new puzzle.");
    }
}

function submitGuess() {
    const guess = guessInput.value.toUpperCase().trim();
    const pattern = currentPattern.map(p => p === 'n' ? 'b' : p).join(''); 
    
    if (guess.length !== 5) {
        alert('Please enter a 5-letter word');
        return;
    }
    if (guesses.length >= MAX_GUESSES) {
        alert('Game board is full. Please start a new game.');
        return;
    }
    clearPreviewTiles(); 
    guesses.push({ word: guess, pattern });
    solver.filterWords(guess, pattern);
    
    updateGuessesHistory();
    updateGameStats();
    calculateRecommendations(10); 
    
    guessInput.value = '';
    currentPattern = ['n', 'n', 'n', 'n', 'n']; 
    updatePatternButtons();
    
    if (pattern === 'ggggg') {
        showToast(`Congratulations! You solved it in ${guesses.length} guess(es)!`);
    }
}


/* --- 5. INITIALIZATION & EVENT LISTENERS --- */

patternButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const states = ['n', 'b','y', 'g'];
        const currentIndex = states.indexOf(currentPattern[index]);
        const nextIndex = (currentIndex + 1) % 4; 
        currentPattern[index] = states[nextIndex];
        updatePatternButtons();
    });
});

document.getElementById('submitBtn').addEventListener('click', submitGuess);
document.getElementById('resetBtn').addEventListener('click', resetSolver);

guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitGuess();
});

guessInput.addEventListener('input', () => {
    clearPreviewTiles();
});

async function initializeApp() {
    const startTime = Date.now();
    const MIN_LOAD_TIME = 1500; 

    setInitialTheme();
    createHistoryGrid();
    try {
        const [answersRes, guessesRes] = await Promise.all([
            fetch('./data/possible_answers.txt'),
            fetch('./data/allowed_guesses.txt')
        ]);

        if (!answersRes.ok || !guessesRes.ok) {
            throw new Error('Failed to load word lists.');
        }

        const answersText = await answersRes.text();
        const guessesText = await guessesRes.text();
        
        loaderMessage.textContent = 'Parsing word lists...';

        const parseWords = (text) => text.trim().split('\n')
            .map(line => line.trim().toUpperCase())
            .filter(word => word.length === 5 && /^[A-Z]+$/.test(word));

        const possibleAnswers = parseWords(answersText);
        const allowedGuesses = parseWords(guessesText);
        
        const allAllowedWords = [...new Set([...possibleAnswers, ...allowedGuesses])];
        solver = new WordleSolver(possibleAnswers, allAllowedWords);
        
        loaderMessage.textContent = 'Calculating initial possibilities...';
        
        updateGameStats();
        calculateRecommendations(10); 

    } catch (error) {
        console.error('Error loading word lists:', error);
        recommendationsList.innerHTML = 
            '<div class="empty-state" style="color: red;">ERROR: Failed to load word lists.</div>';
    } finally {
        const elapsedTime = Date.now() - startTime;
        const remainingTime = MIN_LOAD_TIME - elapsedTime;

        if (remainingTime > 0) {
            setTimeout(hideLoader, remainingTime);
        } else {
            hideLoader();
        }
    }
}

// Start the application
initializeApp();
