export function essentialsWaitMessage(nextAllowedAt,now){
 const minutes=Math.max(0,Math.ceil((Date.parse(nextAllowedAt)-now)/60000));
 if(!Number.isFinite(minutes))return 'Update availability will be checked again when you reopen this panel.';
 if(!minutes)return 'You can update this travel brief again now.';
 const hours=Math.floor(minutes/60),remainder=minutes%60;
 return `You can update this travel brief again in ${hours?`${hours}h `:''}${remainder}m.`;
}
