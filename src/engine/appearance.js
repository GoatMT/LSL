export function appearanceFor(player='player'){
 const id=typeof player==='string'?player:(player?.id||'player');let hash=2166136261;for(const c of id)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const skin=['#ddb596','#c7926d','#ad7654','#87563f','#684531','#cea17e','#bc8a67','#9b6c4e'],physical=typeof player==='object'?player?.gameplayProfile?.physical||{}:{};
 const sourceBuild=Number(physical.build)||1,build=.94+((hash>>>13)%5)*.035,height=.97+((hash>>>17)%5)*.015;
 const hairstyle=physical.hairStyle==='short'?5:physical.hairStyle==='long'?'long':(hash>>>9)%5;
 // Build profiles shape the torso, but only add a small amount to the full-body
 // scale so heavier players read as broad without dwarfing teammates.
 const bulk=Math.max(0,Math.min(.9,(sourceBuild-1)/.55));
 const buildScale=Math.max(.97,Math.min(1.035,1+(sourceBuild-1)*.08));
 return {skin:skin[hash%skin.length],hair:['#24211f','#362b25','#191d21','#584332'][(hash>>>5)%4],hairstyle,build:build*buildScale,height:height*(physical.height||1),bulk,glasses:physical.glasses===true,beard:(hash>>>21)%3===0,boots:['#f0eee4','#20323d','#bd653e','#bcc67a'][(hash>>>25)%4]};
}
