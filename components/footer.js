import { SITE } from "../js/config.js";
import { escapeHTML } from "../js/utils.js";

export function renderFooter() {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-copy">
          <strong>${escapeHTML(SITE.name)}</strong>
          <span class="footer-tagline">Built with the speed and skill of our players.</span>
          <span class="footer-shoutout">Shoutout: Abdul Ghiyas Solyman, Taaha Nakhuda &amp; Ishaaq Ali.</span>
          <small class="footer-copyright">&copy; ${year} Lantern Soccer League</small>
        </div>
        <div class="footer-partners" aria-label="League partners and games">
          <div class="footer-partner">
            <a class="footer-partner-link footer-academy-link" href="https://lanternofknowledgeacademy.ca/" target="_blank" rel="noopener noreferrer" aria-label="Visit Lantern of Knowledge Academy">
              <img class="footer-academy-logo" src="./Logos/lantern-of-knowledge-academy.png" alt="" width="112" height="112" loading="lazy">
            </a>
            <span>Academy</span>
          </div>
          <div class="footer-partner">
            <a class="footer-partner-link footer-instagram-link" href="https://www.instagram.com/lanternsoccerleague/" target="_blank" rel="noopener noreferrer" aria-label="Visit Lantern Soccer League on Instagram" title="Instagram">
              <svg class="footer-instagram-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"></rect>
                <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"></circle>
                <circle cx="17.5" cy="6.8" r="1.1" fill="currentColor"></circle>
              </svg>
            </a>
            <span>Instagram</span>
          </div>
          <div class="footer-partner">
            <a class="footer-partner-link footer-rush-link" href="https://goatmt.github.io/Lantern-Rush/" target="_blank" rel="noopener noreferrer" aria-label="Play Lantern Rush">
              <img class="footer-rush-logo" src="./Logos/LanternRush.png" alt="" width="160" height="112" loading="lazy">
            </a>
            <span>Lantern Rush</span>
          </div>
        </div>
      </div>
    </footer>
  `;
}

