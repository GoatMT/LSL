import { SITE } from "../js/config.js";
import { escapeHTML } from "../js/utils.js";

export function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div>
          <strong>${escapeHTML(SITE.name)}</strong><br>
          <span>Built With Polished ChatGPT's Very Own Codex With A Mix Of Gemeni</span>
        </div>
      </div>
    </footer>
  `;
}
