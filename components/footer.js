import { SITE } from "../js/config.js";
import { escapeHTML } from "../js/utils.js";

export function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-copy">
          <strong>${escapeHTML(SITE.name)}</strong><br>
          <span>Built With The Speed And Skill Of Our Players</span><br>
          <span class="footer-shoutout">Shoutout to Abdul Ghiyas Solyman, Taaha Nakhuda, and Ishaaq Ali.</span>
        </div>
        <div class="footer-partners" aria-label="League partners and games">
          <a
            class="footer-partner-link footer-academy-link"
            href="https://lanternofknowledgeacademy.ca/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Lantern of Knowledge Academy"
          >
            <img
              class="footer-academy-logo"
              src="./Logos/lantern-of-knowledge-academy.png"
              alt="Lantern of Knowledge Academy"
              width="112"
              height="112"
            >
          </a>
          <a
            class="footer-partner-link footer-instagram-link"
            href="https://www.instagram.com/lanternsoccerleague/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit Lantern Soccer League on Instagram"
            title="Instagram"
          >
            <svg class="footer-instagram-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
              <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
              <circle cx="17.5" cy="6.8" r="1.1" fill="currentColor"></circle>
            </svg>
          </a>
          <a
            class="footer-partner-link footer-rush-link"
            href="https://goatmt.github.io/Lantern-Rush/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Play Lantern Rush"
          >
            <img
              class="footer-rush-logo"
              src="./Logos/LanternRush.png"
              alt="Lantern Rush"
              width="160"
              height="112"
            >
          </a>
        </div>
      </div>
    </footer>
  `;
}

