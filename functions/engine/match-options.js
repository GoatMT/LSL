export const MATCH_DURATIONS=Object.freeze([1,2,3,4,5,6]);
export const matchDuration=value=>MATCH_DURATIONS.includes(Number(value))?Number(value):6;
export const durationButtons=()=>MATCH_DURATIONS.map(n=>`<button data-duration="${n}">${n} MIN</button>`).join('');
