// 2026 senior kit references supplied by the user. Keep season-specific identity separate from rosters.
export const SEASON_KITS={
  '2026':{
    'em-haulers-fc':{primary:'#1653b5',secondary:'#124494',trim:'#b4c3db',shorts:'#164b9f',socks:'#164b9f',pattern:'solid'},
    'leeward-lions':{primary:'#ed804a',secondary:'#233779',trim:'#f1dcc4',shorts:'#233779',socks:'#172c65',pattern:'gradient'},
    'refuel-rovers':{primary:'#f0efeb',secondary:'#3466a2',trim:'#2b5390',shorts:'#254c87',socks:'#263b61',pattern:'sleeves'},
    'sharp-strikers':{primary:'#d3b280',secondary:'#b58c5e',trim:'#27272b',shorts:'#c6a473',socks:'#252730',pattern:'solid'},
    'rawaha-royals':{primary:'#442d6c',secondary:'#756091',trim:'#c3b5d0',shorts:'#242833',socks:'#242833',pattern:'sash'},
    'gangat-warriors':{primary:'#eeeee9',secondary:'#bd293e',trim:'#243459',shorts:'#243459',socks:'#233557',pattern:'stripe'},
    'memon-mavericks':{primary:'#216b50',secondary:'#194d3c',trim:'#d7ddbe',shorts:'#233830',socks:'#233830',pattern:'solid'}
  }
};
export function teamKit(season,id,primary='#90a6af'){
  return {...(SEASON_KITS[season]?.[id]||{primary,secondary:primary,trim:'#eee7d2',shorts:'#102a30',socks:primary,pattern:'solid'})};
}
export function kitSwatch(kit){
  if(kit.pattern==='gradient')return 'linear-gradient('+kit.primary+', '+kit.secondary+')';
  if(kit.pattern==='stripe')return 'linear-gradient(90deg,'+kit.primary+' 32%,'+kit.secondary+' 32% 68%,'+kit.primary+' 68%)';
  if(kit.pattern==='sleeves')return 'linear-gradient(90deg,'+kit.secondary+' 22%,'+kit.primary+' 22% 78%,'+kit.secondary+' 78%)';
  if(kit.pattern==='sash')return 'linear-gradient(135deg,'+kit.primary+' 40%,'+kit.secondary+' 40% 55%,'+kit.primary+' 55%)';
  return kit.primary;
}
