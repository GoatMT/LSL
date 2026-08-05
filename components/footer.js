import { SITE } from "../js/config.js";
import { escapeHTML } from "../js/utils.js";

export function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div>
          <strong>${escapeHTML(SITE.name)}</strong><br>
          <span>Built with polished code — ChatGPT's very own Codex, with a mix of Gemini.</span><br>
          <span>Built With The Speed And Skill Of Our Players</span><br>
          <span class="footer-shoutout">Shoutout: Abdul Ghiyas Solyman (TikTok: <a href="https://www.tiktok.com/@raz.aep14" target="_blank" rel="noopener">@raz.aep14</a>), Taaha Nakhuda, Ishaaq Ali — and as far as who I am, keeping that on the low 😉</span>
        </div>
      </div>
    </footer>
  `;
}
