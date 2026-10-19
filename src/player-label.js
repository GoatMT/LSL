// Shared by menus and live match events. Missing source numbers stay absent.
export function playerLabel(player){
  const name=String(player?.name??'');
  return name+(Number.isSafeInteger(player?.jersey)&&player.jersey>=0?' #'+player.jersey:'');
}
