/**
 * When Supabase cannot use the requested redirect it sends invite/recovery links to the site root
 * (`/#access_token=…&type=invite` or `#error_code=otp_expired`). The root redirects while streaming (meta refresh),
 * which drops the `#…` part, so this runs inline in <head> before that and hands the fragment to the password page.
 * Plain ES5 on purpose: it executes before any app code.
 */
export const EMAIL_LINK_HANDOFF_SCRIPT = `(function(){try{
var p=location.pathname,f=new URLSearchParams(location.hash.replace(/^#/,""));
if(p.indexOf("/recovery/confirm")===0||(!f.has("access_token")&&!f.has("error_code")))return;
var s=p.indexOf("/work")===0?"work":p.indexOf("/customer")===0?"customer":"admin";
location.replace("/recovery/confirm?surface="+s+"#"+f.toString());
}catch(e){}})();`;
