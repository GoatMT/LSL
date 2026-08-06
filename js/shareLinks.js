import { escapeHTML } from "./utils.js";

export function absoluteUrl(path) {
  try {
    return new URL(path, window.location.href).toString();
  } catch {
    return path;
  }
}

function shareIntents(url, title) {
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  return [
    { key: "x", label: "X", href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}` },
    { key: "facebook", label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { key: "whatsapp", label: "WhatsApp", href: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}` },
  ];
}

/**
 * Renders a "Copy Link" button plus a row of social share links.
 * Call initShareButtons() after inserting this into the DOM so the
 * copy-link button actually works (it needs a click handler, unlike
 * the social links which are plain anchors).
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
        ${shareIntents(absolute, title)
          .map(
            (intent) => `
              <a class="share-btn ${escapeHTML(intent.key)}" href="${escapeHTML(intent.href)}" target="_blank" rel="noopener" title="Share to ${escapeHTML(intent.label)}">
                <span>${escapeHTML(intent.label)}</span>
              </a>
            `
          )
          .join("")}
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
