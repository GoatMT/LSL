export function hydrateTabs(root = document) {
  if (root.documentElement?.dataset.tabsReady === "true") return;
  if (root === document) root.documentElement.dataset.tabsReady = "true";

  const tabFrom = (target) => target instanceof Element ? target.closest('[role="tab"]') : null;

  root.addEventListener("click", (event) => {
    const tab = tabFrom(event.target);
    if (!tab) return;
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    tabs.forEach((item) => item.setAttribute("tabindex", item === tab ? "0" : "-1"));
  });

  root.addEventListener("keydown", (event) => {
    const tab = tabFrom(event.target);
    if (!tab) return;
    const list = tab.closest('[role="tablist"]');
    if (!list) return;
    const tabs = [...list.querySelectorAll('[role="tab"]')].filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true");
    if (!tabs.length) return;
    const vertical = list.getAttribute("aria-orientation") === "vertical";
    const backwards = vertical ? event.key === "ArrowUp" : event.key === "ArrowLeft";
    const forwards = vertical ? event.key === "ArrowDown" : event.key === "ArrowRight";
    let nextIndex = tabs.indexOf(tab);
    if (backwards) nextIndex = (nextIndex - 1 + tabs.length) % tabs.length;
    else if (forwards) nextIndex = (nextIndex + 1) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    tabs.forEach((item) => item.setAttribute("tabindex", item === nextTab ? "0" : "-1"));
    nextTab.focus();
    nextTab.click();
  });
}
