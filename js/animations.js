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

function watchForNewContent() {
  const pageRoot = document.getElementById("page-root");
  if (!pageRoot) return;

  observeRevealCandidates(pageRoot);

  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        observeRevealCandidates(node);
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
