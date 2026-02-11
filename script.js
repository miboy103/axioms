/* ============================================
   NEXUS — Scientific Calculator Logic
   ============================================ */

// ---- State ----
let expression = '';
let currentResult = '0';
let history = [];
let historyOpen = false;
let currentMode = 'calc';
let lastAnswer = null;

// Currency state
let currencyInputStr = '0';
let currentPair = 'usd-ngn';
let pairSwapped = false;

// Approximate exchange rates (static for offline use)
const RATES = {
  'usd-ngn': { rate: 1580, from: 'USD', to: 'NGN', symbol: '$', toSymbol: '₦' },
  'eur-usd': { rate: 1.09, from: 'EUR', to: 'USD', symbol: '€', toSymbol: '$' },
  'nok-usd': { rate: 0.092, from: 'NOK', to: 'USD', symbol: 'kr', toSymbol: '$' }
};

// DOM refs
const exprEl = document.getElementById('expression');
const resultEl = document.getElementById('result');
const currencyLabelEl = document.getElementById('currency-label');
const currencyResultEl = document.getElementById('currency-result');
const currencyInputEl = document.getElementById('currency-input');
const currencySymEl = document.getElementById('currency-sym');
const historyPanel = document.getElementById('history-panel');
const historyBackdrop = document.getElementById('history-backdrop');
const historyList = document.getElementById('history-list');

// ============================================
// MODE SWITCHING
// ============================================

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === mode);
  });
  document.querySelectorAll('.mode-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(mode + '-mode').classList.add('active');
}

// ============================================
// CALCULATOR — Input
// ============================================

function inputNum(val) {
  if (val === '±') {
    toggleSign();
    return;
  }

  // Prevent multiple dots in current number segment
  if (val === '.') {
    const segments = expression.split(/[\+\-\*\/\(\)]/);
    const lastSeg = segments[segments.length - 1];
    if (lastSeg.includes('.')) return;
  }

  // If we just evaluated and user starts typing a number, reset
  if (lastAnswer !== null && !isOperator(expression.slice(-1))) {
    expression = '';
    lastAnswer = null;
  }

  expression += val;
  updateDisplay();
  liveEvaluate();
}

function inputOp(op) {
  // If expression is empty and we have a last answer, chain from it
  if (expression === '' && lastAnswer !== null) {
    expression = String(lastAnswer);
  }

  // Don't stack operators — replace the last one
  if (expression.length > 0 && isOperator(expression.slice(-1))) {
    expression = expression.slice(0, -1);
  }

  // Don't start with an operator (except minus for negative)
  if (expression === '' && op !== '-') return;

  expression += op;
  lastAnswer = null;
  updateDisplay();
}

function inputParenthesis() {
  const openCount = (expression.match(/\(/g) || []).length;
  const closeCount = (expression.match(/\)/g) || []).length;
  const lastChar = expression.slice(-1);

  if (
    expression === '' ||
    lastChar === '(' ||
    isOperator(lastChar)
  ) {
    expression += '(';
  } else if (openCount > closeCount) {
    expression += ')';
  } else {
    expression += '*(';
  }

  updateDisplay();
  liveEvaluate();
}

function backspace() {
  if (expression.length === 0) return;

  // Check if we need to remove a function name like "sin(", "cos(", etc.
  const funcMatch = expression.match(/(sin|cos|tan|log|ln|sqrt|abs)\($/);
  if (funcMatch) {
    expression = expression.slice(0, -(funcMatch[1].length + 1));
  } else {
    expression = expression.slice(0, -1);
  }

  updateDisplay();
  liveEvaluate();
}

function clearAll() {
  expression = '';
  currentResult = '0';
  lastAnswer = null;
  updateDisplay();
  resultEl.classList.remove('error');
}

function toggleSign() {
  if (expression === '' && lastAnswer !== null) {
    expression = String(-lastAnswer);
    lastAnswer = null;
  } else if (expression.startsWith('-')) {
    expression = expression.slice(1);
  } else if (expression !== '') {
    expression = '-' + expression;
  }
  updateDisplay();
  liveEvaluate();
}

// ============================================
// SCIENTIFIC FUNCTIONS
// ============================================

function sciFunc(func) {
  // If we just calculated, use the answer
  if (lastAnswer !== null && expression === '') {
    expression = String(lastAnswer);
    lastAnswer = null;
  }

  switch (func) {
    case 'sin':
      expression += 'sin(';
      break;
    case 'cos':
      expression += 'cos(';
      break;
    case 'tan':
      expression += 'tan(';
      break;
    case 'log':
      expression += 'log(';
      break;
    case 'ln':
      expression += 'ln(';
      break;
    case 'sqrt':
      expression += 'sqrt(';
      break;
    case 'abs':
      expression += 'abs(';
      break;
    case 'pow':
      // Square the current expression or append ^2
      if (expression !== '') {
        expression = '(' + expression + ')^2';
      }
      break;
    case 'pi':
      if (expression !== '' && !isOperator(expression.slice(-1)) && expression.slice(-1) !== '(') {
        expression += '*';
      }
      expression += 'π';
      break;
    case 'e':
      if (expression !== '' && !isOperator(expression.slice(-1)) && expression.slice(-1) !== '(') {
        expression += '*';
      }
      expression += 'e';
      break;
    case 'factorial':
      if (expression !== '') {
        expression += '!';
      }
      break;
    case 'inv':
      if (expression !== '') {
        expression = '1/(' + expression + ')';
      }
      break;
  }

  updateDisplay();
  liveEvaluate();
}

// ============================================
// EVALUATION ENGINE
// ============================================

function calculate() {
  if (expression === '') return;

  const equalsBtn = document.querySelector('.btn-equals');
  equalsBtn.classList.remove('pulse');
  void equalsBtn.offsetWidth; // reflow
  equalsBtn.classList.add('pulse');

  try {
    const result = evaluateExpression(expression);
    if (result === undefined || result === null || isNaN(result)) {
      showError('Error');
      return;
    }
    if (!isFinite(result)) {
      showError('Infinity');
      return;
    }

    const formatted = formatResult(result);
    addHistory(expression, formatted);

    // Flash animation on result
    resultEl.classList.add('flash');
    setTimeout(() => resultEl.classList.remove('flash'), 400);

    lastAnswer = result;
    exprEl.textContent = formatExpression(expression) + ' =';
    expression = '';
    currentResult = formatted;
    resultEl.textContent = currentResult;
    resultEl.classList.remove('error');
  } catch (err) {
    showError('Error');
  }
}

function liveEvaluate() {
  if (expression === '') {
    currentResult = '0';
    resultEl.textContent = '0';
    resultEl.classList.remove('error');
    return;
  }

  try {
    // Auto-close parentheses for live preview
    let evalExpr = expression;
    const openCount = (evalExpr.match(/\(/g) || []).length;
    const closeCount = (evalExpr.match(/\)/g) || []).length;
    for (let i = 0; i < openCount - closeCount; i++) {
      evalExpr += ')';
    }

    // Don't eval if it ends with an operator
    if (isOperator(evalExpr.slice(-1))) return;

    const result = evaluateExpression(evalExpr);
    if (result !== undefined && result !== null && !isNaN(result) && isFinite(result)) {
      currentResult = formatResult(result);
      resultEl.textContent = currentResult;
      resultEl.classList.remove('error');
    }
  } catch (e) {
    // Silent fail for live preview
  }
}

function evaluateExpression(expr) {
  // Transform expression to evaluable form
  let transformed = expr
    .replace(/π/g, '(Math.PI)')
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, '(Math.E)')
    .replace(/sin\(/g, 'Math.sin(')
    .replace(/cos\(/g, 'Math.cos(')
    .replace(/tan\(/g, 'Math.tan(')
    .replace(/log\(/g, 'Math.log10(')
    .replace(/ln\(/g, 'Math.log(')
    .replace(/sqrt\(/g, 'Math.sqrt(')
    .replace(/abs\(/g, 'Math.abs(')
    .replace(/\^/g, '**');

  // Handle factorial
  transformed = transformed.replace(/(\d+)!/g, (_, n) => {
    return 'factorial(' + n + ')';
  });

  // Close unclosed parentheses
  const openCount = (transformed.match(/\(/g) || []).length;
  const closeCount = (transformed.match(/\)/g) || []).length;
  for (let i = 0; i < openCount - closeCount; i++) {
    transformed += ')';
  }

  // Sanitize — only allow math expressions
  if (/[^0-9+\-*/().Math\s,sincotaglqrtbfcoeialEPI^!]/.test(transformed.replace(/Math\.\w+/g, '').replace(/factorial/g, ''))) {
    throw new Error('Invalid expression');
  }

  // Use Function constructor for safe-ish eval
  const factorialFn = function factorial(n) {
    n = Math.round(n);
    if (n < 0) return NaN;
    if (n === 0 || n === 1) return 1;
    if (n > 170) return Infinity;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  const fn = new Function('factorial', '"use strict"; return (' + transformed + ')');
  return fn(factorialFn);
}

function formatResult(num) {
  if (Number.isInteger(num) && Math.abs(num) < 1e15) {
    return num.toLocaleString('en-US');
  }

  // For very large or very small numbers use scientific notation
  if (Math.abs(num) >= 1e15 || (Math.abs(num) < 0.0001 && num !== 0)) {
    return num.toExponential(6);
  }

  // Round to avoid floating point artifacts
  const rounded = parseFloat(num.toPrecision(12));
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 10 });
}

function formatExpression(expr) {
  return expr
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/\-/g, '−');
}

function showError(msg) {
  resultEl.textContent = msg;
  resultEl.classList.add('error');
  expression = '';
  lastAnswer = null;
}

function updateDisplay() {
  exprEl.textContent = formatExpression(expression);
}

function isOperator(char) {
  return ['+', '-', '*', '/'].includes(char);
}

// ============================================
// HISTORY
// ============================================

function toggleHistory() {
  historyOpen = !historyOpen;
  historyPanel.classList.toggle('open', historyOpen);
  historyBackdrop.classList.toggle('open', historyOpen);
}

function addHistory(expr, result) {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  history.unshift({ expr, result, time: timestamp });

  // Keep max 50 entries
  if (history.length > 50) history.pop();

  renderHistory();
}

function clearHistory() {
  history = [];
  renderHistory();
}

function renderHistory() {
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">No calculations yet</div>';
    return;
  }

  historyList.innerHTML = history.map((item, i) => `
    <div class="history-item" onclick="recallHistory(${i})" style="animation-delay: ${i * 0.05}s">
      <div class="history-item-expr">${formatExpression(item.expr)}</div>
      <div class="history-item-result">= ${item.result}</div>
      <div class="history-item-time">${item.time}</div>
    </div>
  `).join('');
}

function recallHistory(index) {
  const item = history[index];
  if (!item) return;

  expression = '';
  // Parse the result back to a number
  const numStr = item.result.replace(/,/g, '');
  const num = parseFloat(numStr);
  if (!isNaN(num)) {
    lastAnswer = num;
    currentResult = item.result;
    resultEl.textContent = currentResult;
    exprEl.textContent = formatExpression(item.expr) + ' =';
    resultEl.classList.remove('error');
  }

  // Close history panel
  toggleHistory();
}

// ============================================
// CURRENCY CONVERTER
// ============================================

function selectPair(pair) {
  currentPair = pair;
  pairSwapped = false;
  document.querySelectorAll('.currency-pair').forEach(p => {
    p.classList.toggle('active', p.dataset.pair === pair);
  });
  updateCurrencyLabel();
  currencyInputStr = '0';
  currencyInputEl.textContent = '0';
  currencyResultEl.textContent = '0';
}

function updateCurrencyLabel() {
  const data = RATES[currentPair];
  if (pairSwapped) {
    currencyLabelEl.textContent = `${data.to} → ${data.from}`;
    currencySymEl.textContent = data.toSymbol;
  } else {
    currencyLabelEl.textContent = `${data.from} → ${data.to}`;
    currencySymEl.textContent = data.symbol;
  }
}

function currencyNum(val) {
  if (val === '.' && currencyInputStr.includes('.')) return;
  if (currencyInputStr === '0' && val !== '.') {
    currencyInputStr = val;
  } else {
    currencyInputStr += val;
  }

  // Limit length
  if (currencyInputStr.replace('.', '').length > 12) {
    currencyInputStr = currencyInputStr.slice(0, -1);
    return;
  }

  currencyInputEl.textContent = formatCurrencyInput(currencyInputStr);
}

function currencyClear() {
  currencyInputStr = '0';
  currencyInputEl.textContent = '0';
  currencyResultEl.textContent = '0';
  currencyLabelEl.textContent = pairSwapped
    ? `${RATES[currentPair].to} → ${RATES[currentPair].from}`
    : `${RATES[currentPair].from} → ${RATES[currentPair].to}`;
}

function currencyBackspace() {
  if (currencyInputStr.length <= 1) {
    currencyInputStr = '0';
  } else {
    currencyInputStr = currencyInputStr.slice(0, -1);
  }
  currencyInputEl.textContent = formatCurrencyInput(currencyInputStr);
}

function swapCurrency() {
  pairSwapped = !pairSwapped;
  updateCurrencyLabel();
  // Re-convert with current input
  convertCurrency();
}

function convertCurrency() {
  const data = RATES[currentPair];
  const amount = parseFloat(currencyInputStr);
  if (isNaN(amount)) {
    currencyResultEl.textContent = 'Invalid';
    return;
  }

  let result;
  if (pairSwapped) {
    result = amount / data.rate;
  } else {
    result = amount * data.rate;
  }

  const toSym = pairSwapped ? data.symbol : data.toSymbol;
  const formatted = result.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Flash effect
  currencyResultEl.classList.add('flash');
  setTimeout(() => currencyResultEl.classList.remove('flash'), 400);

  currencyResultEl.textContent = `${toSym} ${formatted}`;

  // Update label
  const fromSym = pairSwapped ? data.toSymbol : data.symbol;
  const fromName = pairSwapped ? data.to : data.from;
  const toName = pairSwapped ? data.from : data.to;
  const inputFormatted = parseFloat(currencyInputStr).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  currencyLabelEl.textContent = `${fromSym}${inputFormatted} ${fromName} → ${toName}`;
}

function formatCurrencyInput(str) {
  const parts = str.split('.');
  const intPart = parts[0];
  const formatted = parseInt(intPart).toLocaleString('en-US');
  if (parts.length > 1) {
    return formatted + '.' + parts[1];
  }
  return formatted === 'NaN' ? '0' : formatted;
}

// ============================================
// KEYBOARD SUPPORT
// ============================================

document.addEventListener('keydown', (e) => {
  if (currentMode !== 'calc') return;

  const key = e.key;

  if (/^[0-9]$/.test(key)) {
    inputNum(key);
    e.preventDefault();
  } else if (key === '.') {
    inputNum('.');
    e.preventDefault();
  } else if (key === '+') {
    inputOp('+');
    e.preventDefault();
  } else if (key === '-') {
    inputOp('-');
    e.preventDefault();
  } else if (key === '*') {
    inputOp('*');
    e.preventDefault();
  } else if (key === '/') {
    inputOp('/');
    e.preventDefault();
  } else if (key === 'Enter' || key === '=') {
    calculate();
    e.preventDefault();
  } else if (key === 'Backspace') {
    backspace();
    e.preventDefault();
  } else if (key === 'Escape' || key === 'Delete') {
    clearAll();
    e.preventDefault();
  } else if (key === '(' || key === ')') {
    inputParenthesis();
    e.preventDefault();
  }
});

// ============================================
// BUTTON PRESS RIPPLE EFFECT
// ============================================

document.querySelectorAll('.btn').forEach(btn => {
  btn.addEventListener('pointerdown', (e) => {
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty('--ripple-x', x + '%');
    btn.style.setProperty('--ripple-y', y + '%');
  });
});

// ============================================
// INIT
// ============================================

updateCurrencyLabel();