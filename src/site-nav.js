const icons={home:'<path d="m3 10 9-7 9 7v10H6V10m3 10v-7h6v7"/>',charts:'<path d="M3 21V11h6v10m0 0V4h6v17m0 0v-7h6v7"/>',account:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>'};
class SiteNav extends HTMLElement{
  connectedCallback(){
    if(this.childElementCount)return;
    import('./h2h/invites.js').then(m=>m.startInviteNotifications()).catch(()=>{});
    const active=this.getAttribute('active');
    this.innerHTML=`<div class="site-nav-inner"><a class="site-nav-brand" href="./index.html" aria-label="Lantern Rush home"><img src="./assets/lsl-logo.png" alt=""><span>LANTERN<br>RUSH</span></a><nav aria-label="Main navigation">${['home','charts','account','settings'].map(key=>{const attrs=`class="site-nav-button" aria-label="${key[0].toUpperCase()+key.slice(1)}" ${active===key?'aria-current="page"':''}`,body=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key]}</svg><span>${key.toUpperCase()}</span>`;return key==='settings'?`<button type="button" ${attrs}>${body}</button>`:`<a href="./${key==='home'?'index':key}.html" ${attrs}>${body}</a>`;}).join('')}</nav></div>`;
    this.querySelector('button').addEventListener('click',async()=>{
      const button=this.querySelector('button');button.disabled=true;
      try{
        const request=new CustomEvent('lantern-settings-request',{cancelable:true});
        if(document.dispatchEvent(request))await (await import('./page-settings.js')).openSettings();
        const dialog=document.getElementById('settings-dialog');
        if(dialog?.open){button.setAttribute('aria-pressed','true');dialog.addEventListener('close',()=>button.removeAttribute('aria-pressed'),{once:true});}
      }catch(error){alert('Settings could not load. Please refresh and try again.');console.error(error);}
      finally{button.disabled=false;}
    });
  }
}
customElements.define('site-nav',SiteNav);
