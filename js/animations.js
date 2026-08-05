const REVEAL_SELECTOR = ".section-panel, .card, .hero, .franchise-bracket-round, .advanced-chart-card, .important-news-card, .history-card";
const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let revealObserver = null;
const observedNodes = new WeakSet();

function ensureRevealObserver() {
  if (revealObserver || prefersReducedMotion) return revealObserver;
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in-view");
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
  );
  return revealObserver;
}

function observeRevealCandidates(root) {
  if (prefersReducedMotion) return;
  const observer = ensureRevealObserver();
  const candidates = root.matches?.(REVEAL_SELECTOR) ? [root, ...root.querySelectorAll(REVEAL_SELECTOR)] : [...root.querySelectorAll(REVEAL_SELECTOR)];

  candidates.forEach((node, index) => {
    if (observedNodes.has(node)) return;
    observedNodes.add(node);
    node.classList.add("reveal-on-scroll");
    node.style.setProperty("--reveal-delay", `${Math.min(index % 8, 8) * 45}ms`);
    observer.observe(node);
  });
}

// ---------- Count-up numbers ----------

// Matches isolated numeric text: 27 | 1,234 | -16 | +18 | 2.29 | 45.2% | $14.4M
const COUNT_REGEX = /^([+-]?)(\$?)(\d{1,3}(?:,\d{3})*|\d+)(\.\d+)?(%|M|K)?$/;
const countedNodes = new WeakSet();
let countObserver = null;

function parseCountable(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  const match = COUNT_REGEX.exec(trimmed);
  if (!match) return null;
  const [, signRaw, currency, intPart, decPart, suffix] = match;
  const decimals = decPart ? decPart.length - 1 : 0;
  const numericString = `${signRaw}${intPart.replace(/,/g, "")}${decPart || ""}`;
  const targetValue = Number(numericString);
  if (!Number.isFinite(targetValue) || targetValue === 0) return null;

  return {
    targetValue,
    decimals,
    hasCommas: intPart.includes(","),
    currency,
    suffix: suffix || "",
    explicitPlus: signRaw === "+",
    original: trimmed,
  };
}

function formatCountValue(value, meta) {
  const rounded = meta.decimals ? Number(value.toFixed(meta.decimals)) : Math.round(value);
  const sign = rounded < 0 ? "-" : meta.explicitPlus && rounded > 0 ? "+" : "";
  const absValue = Math.abs(rounded);
  const numberText = meta.hasCommas
    ? absValue.toLocaleString("en-US", { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals })
    : meta.decimals
      ? absValue.toFixed(meta.decimals)
      : String(absValue);
  return `${sign}${meta.currency}${numberText}${meta.suffix}`;
}

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

function runCountAnimation(el, meta) {
  const duration = 900;
  const start = performance.now();

  function frame(now) {
    const elapsed = Math.min(1, (now - start) / duration);
    const eased = easeOutCubic(elapsed);
    el.textContent = formatCountValue(meta.targetValue * eased, meta);
    if (elapsed < 1) {
      requestAnimationFrame(frame);
    } else {
      el.textContent = meta.original;
    }
  }
  requestAnimationFrame(frame);
}

function ensureCountObserver() {
  if (countObserver || prefersReducedMotion) return countObserver;
  countObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const meta = entry.target.__lslCountMeta;
        countObserver.unobserve(entry.target);
        if (meta) runCountAnimation(entry.target, meta);
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -20px 0px" }
  );
  return countObserver;
}

function observeCountCandidates(root) {
  if (prefersReducedMotion) return;
  const scope = root.nodeType === Node.ELEMENT_NODE ? root : null;
  if (!scope) return;
  const elements = scope.matches?.("*") ? [scope, ...scope.querySelectorAll("*")] : [...scope.querySelectorAll("*")];
  const observer = ensureCountObserver();

  elements.forEach((el) => {
    if (countedNodes.has(el)) return;
    if (el.children.length > 0) return; // leaf nodes only
    const meta = parseCountable(el.textContent || "");
    if (!meta) return;

    countedNodes.add(el);
    el.__lslCountMeta = meta;
    el.textContent = formatCountValue(0, meta);
    observer.observe(el);
  });
}

function watchForNewContent() {
  const pageRoot = document.getElementById("page-root");
  if (!pageRoot) return;

  observeRevealCandidates(pageRoot);
  observeCountCandidates(pageRoot);

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        observeRevealCandidates(node);
        observeCountCandidates(node);
      });
    });
  });

  mutationObserver.observe(pageRoot, { childList: true, subtree: true });
}

function animatePageEnter() {
  if (prefersReducedMotion) return;
  document.getElementById("site-navbar")?.classList.add("nav-enter");
  document.getElementById("page-root")?.classList.add("page-enter");
}

export function initPageAnimations() {
  animatePageEnter();
  watchForNewContent();
}
