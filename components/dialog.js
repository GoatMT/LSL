export function bindModalDialog(dialog, { triggerSelector, closeSelector } = {}) {
  if (!dialog || dialog.dataset.accessibilityReady === "true") return;
  dialog.dataset.accessibilityReady = "true";
  let returnFocusTo = null;

  const closeButton = closeSelector ? dialog.querySelector(closeSelector) : dialog.querySelector("button");
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const isOpen = () => !dialog.hidden;

  const open = (trigger) => {
    returnFocusTo = trigger || document.activeElement;
    dialog.hidden = false;
    (closeButton || dialog).focus();
  };

  const close = () => {
    if (!isOpen()) return;
    dialog.hidden = true;
    returnFocusTo?.focus?.();
    returnFocusTo = null;
    dialog.dispatchEvent(new CustomEvent("dialogclose", { bubbles: true }));
  };

  if (triggerSelector) {
    document.addEventListener("click", (event) => {
      const trigger = event.target instanceof Element ? event.target.closest(triggerSelector) : null;
      if (trigger) open(trigger);
    });
  }

  closeButton?.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll(focusableSelector)].filter((item) => !item.hidden && item.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  return { open, close };
}
