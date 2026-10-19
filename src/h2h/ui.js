// Shared interactions for lobby and match overlays.
export async function busyAction(button, action, onError = () => {}) {
  if (!button || button.disabled || button.dataset.busy) return false;
  button.dataset.busy = 'true';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { await action(); return true; }
  catch (error) { onError(error); return false; }
  finally {
    delete button.dataset.busy;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}
export function confirmAction(title, description, label = 'LEAVE MATCH') {
  const dialog = document.getElementById('live-confirm');
  if (dialog.open) return Promise.resolve(false);
  dialog.querySelector('h2').textContent = title;
  dialog.querySelector('p').textContent = description;
  dialog.querySelector('[value="confirm"]').textContent = label;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once:true});
    dialog.showModal();
    dialog.querySelector('[value="cancel"]').focus();
  });
}
export async function copyRoomCode(code, notify) {
  try { await navigator.clipboard.writeText(code); notify('Room ID copied'); }
  catch {
    const dialog = document.getElementById('live-share');
    const input = dialog.querySelector('input');
    input.value = code;
    dialog.showModal();
    input.focus(); input.select();
  }
}
