import { setupLayout } from "./main.js";
import { escapeHTML, setDocumentTitle, statusMessage } from "./utils.js";

setupLayout("owners.html");
setDocumentTitle("Owners");

const root = document.getElementById("page-root");

async function loadOwners() {
  try {
    const response = await fetch("./data/owners.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.warn("Could not load owners", error);
    return { owners: [], admins: [] };
  }
}

function renderContactRow(contact, index) {
  const phone = contact.phone || "";
  const phoneHref = phone ? `tel:${phone.replace(/[^+\d]/g, "")}` : "";
  return `
    <div class="owner-row">
      <strong>${index ? `${index}: ` : ""}${escapeHTML(contact.name || contact.role || "Admin")}</strong>
      ${phoneHref ? `<a href="${escapeHTML(phoneHref)}">${escapeHTML(phone)}</a>` : "<span>Phone not listed</span>"}
    </div>
  `;
}

async function init() {
  root.innerHTML = statusMessage("loading", "Loading owners...");
  const data = await loadOwners();

  root.innerHTML = `
    <section class="section-panel">
      <div class="section-head">
        <div>
          <span class="eyebrow">Owners</span>
          <h1>League Owners and Admins</h1>
          <p>Thank you to the people who organize, support, and keep Lantern Soccer League running.</p>
        </div>
      </div>
      <div class="grid two">
        <div class="card">
          <h3>Owners</h3>
          <div class="owner-list">
            ${(data.owners || []).map((owner, index) => renderContactRow(owner, index + 1)).join("") || statusMessage("empty", "No owners listed yet.")}
          </div>
        </div>
        <div class="card">
          <h3>Admin Contacts</h3>
          <div class="owner-list">
            ${(data.admins || []).map((admin) => renderContactRow(admin, 0)).join("") || statusMessage("empty", "No admins listed yet.")}
          </div>
        </div>
      </div>
    </section>
  `;
}

init();
