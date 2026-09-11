import { setupLayout } from "./main.js";
import { setDocumentTitle } from "./utils.js";

setupLayout("404.html");
setDocumentTitle("Page Not Found");

document.getElementById("page-root").innerHTML = `
  <section class="section-panel not-found-panel">
    <div class="not-found-code">404</div>
    <span class="eyebrow">Page Not Found</span>
    <h1>This LSL page is not available.</h1>
    <p>The link may be old, incomplete, or moved. Return to the league home page to keep browsing.</p>
    <div class="button-row not-found-actions">
      <a class="button primary" href="./index.html">Go To Home Page</a>
      <a class="button" href="./matches.html">Open Matches</a>
    </div>
  </section>
`;
