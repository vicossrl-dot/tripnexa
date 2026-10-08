import {serverMessage,serverLocale,validLocale} from './i18n.js';
import {requestContext} from './request-context.js';
import {buildPasswordResetUrl,buildEmailVerificationUrl} from './app-urls.js';
export function authenticationEmail(user,kind,token,urls){
 const locale=requestContext.getStore()?.locale?serverLocale():validLocale(user.ui_locale)||'en',m=source=>serverMessage(source,locale);
 const subject=m(kind==='verify'?'Verify your TripNexa email':'Reset your TripNexa password');
 const text=kind==='verify'?`${m('Your TripNexa verification code:')} ${token}\n${m('Enter it at')} ${buildEmailVerificationUrl(urls,user.email)}\n${m('Expires in 15 minutes.')}`:`${m('Reset your TripNexa password')}: ${buildPasswordResetUrl(urls,token,user.id)}\n${m('Expires in 15 minutes.')} ${m('Ignore this message if you did not request it.')}`;
 return {subject,text,locale};
}
