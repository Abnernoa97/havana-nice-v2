// Keep foreground images responsive: private thumbnail downloads, album
// metadata and editorial BOOK all share mobile bandwidth and decoder slots.
// This is a bounded, connection-aware best-effort optimization (not offline storage).
export type FamilyNetworkHint={saveData?:boolean;effectiveType?:string};
export const FAMILY_BACKGROUND_THUMBNAIL_LIMIT=3;
export const FAMILY_EAGER_COVER_LIMIT=4;
export function familyBackgroundWarmBudget(hint?:FamilyNetworkHint):number{
 if(hint?.saveData||hint?.effectiveType?.includes('2g'))return 0;
 if(hint?.effectiveType==='3g')return 1;
 return 2;
}
export function familyCoverLoadPriority(index:number):'eager'|'lazy'{
 return index<FAMILY_EAGER_COVER_LIMIT?'eager':'lazy';
}
