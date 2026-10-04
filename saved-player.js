// Never clear other sites' cookies or this game's earned bean progress.
export function clearUsernameCookie(doc,protocol='https:'){
 doc.cookie='dustline_username=; Max-Age=0; Path=/; SameSite=Lax'+(protocol==='https:'?'; Secure':'');
}
