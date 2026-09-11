export function initPageAnimations() {
  const navbar = document.getElementById("site-navbar");
  const pageRoot = document.getElementById("page-root");

  const decorateMotionItems = () => {
    const items = pageRoot?.querySelectorAll([
      ".card",
      ".imt-division-card",
      ".imt-media-card",
      ".imt-news-card",
      ".imt-institution-chip",
      ".imt-schedule-row",
      ".imt-standings-row",
      ".imt-bracket-match",
    ].join(", ")) || [];

    items.forEach((item, index) => {
      if (item.classList.contains("lsl-motion-item")) return;
      item.classList.add("lsl-motion-item");
      item.style.setProperty("--lsl-motion-order", String(Math.min(index, 12)));
    });
  };

  // Add the entrance classes on the next frame so the browser can animate from
  // the initial state instead of treating the classes as already finished.
  window.requestAnimationFrame(() => {
    navbar?.classList.add("nav-enter");
    pageRoot?.classList.add("page-enter");
    decorateMotionItems();
  });

  if (pageRoot && !pageRoot.dataset.motionObserver) {
    const observer = new MutationObserver(() => {
      window.requestAnimationFrame(decorateMotionItems);
    });
    observer.observe(pageRoot, { childList: true, subtree: true });
    pageRoot.dataset.motionObserver = "active";
  }
}
