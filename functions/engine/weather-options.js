export const WEATHER_OPTIONS=Object.freeze(['clear','overcast','rain','snow']);
export const weatherOption=value=>WEATHER_OPTIONS.includes(value)?value:'clear';
export const weatherOptionsHTML=()=>WEATHER_OPTIONS.map(value=>`<option value="${value}">${value.toUpperCase()}</option>`).join('');
