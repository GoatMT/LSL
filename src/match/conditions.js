import {WEATHER_OPTIONS} from '../weather-options.js';

export const MATCH_CONDITION_OPTIONS=Object.freeze({
  venue:['stadium-one','grenoble-ps'],
  lighting:['day','evening','night'],
  weather:WEATHER_OPTIONS
});

export function randomizeMatchConditions(settings,random=Math.random){
  const matchSettings={...settings};
  if(settings.randomConditions===false)return matchSettings;
  for(const [key,options] of Object.entries(MATCH_CONDITION_OPTIONS)){
    const index=Math.max(0,Math.min(options.length-1,Math.floor(random()*options.length)));
    matchSettings[key]=options[index];
  }
  return matchSettings;
}
