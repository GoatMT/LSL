import { escapeHTML } from "./utils.js";

export function absoluteUrl(path) {
  try {
    return new URL(path, window.location.href).toString();
  } catch {
    return path;
  }
}

/**
 * Renders a "Copy Link" button for sharing.
 * Call initShareButtons() after inserting this into the DOM so the
 * button actually works - it needs a click handler to write to the
 * clipboard.
 */
export function renderShareButtons(url, title, { label = "Share" } = {}) {
  const absolute = absoluteUrl(url);
  return `
    <div class="share-buttons">
      <span class="share-buttons-label">${escapeHTML(label)}</span>
      <div class="share-buttons-row">
        <button class="share-btn copy" type="button" data-copy-link="${escapeHTML(absolute)}" title="Copy link">
          <span data-copy-label>Copy Link</span>
        </button>
      </div>
    </div>
  `;
}

function fallbackCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  try {
    document.execCommand("copy");
  } catch (error) {
    console.warn("Could not copy link", error);
  }
  document.body.removeChild(input);
}

export function initShareButtons(root = document) {
  root.querySelectorAll("[data-copy-link]").forEach((button) => {
    if (button.dataset.shareWired) return;
    button.dataset.shareWired = "true";
    button.addEventListener("click", async () => {
      const link = button.dataset.copyLink;
      const labelEl = button.querySelector("[data-copy-label]");
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
        } else {
          fallbackCopy(link);
        }
        if (labelEl) {
          const original = labelEl.textContent;
          labelEl.textContent = "Copied!";
          button.classList.add("copied");
          setTimeout(() => {
            labelEl.textContent = original;
            button.classList.remove("copied");
          }, 1800);
        }
      } catch (error) {
        console.warn("Could not copy link", error);
      }
    });
  });
}
