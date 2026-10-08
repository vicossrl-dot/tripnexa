import { billingSettings } from '../billing/configuration.js';
import { stripeProvider } from '../billing/stripe.js';
export const PAYMENT_NAMES = {card:'Cards',apple_pay:'Apple Pay',google_pay:'Google Pay',paypal:'PayPal',link:'Link',revolut_pay:'Revolut Pay',klarna:'Klarna',mb_way:'MB WAY',bancontact:'Bancontact',blik:'BLIK',eps:'EPS',satispay:'Satispay',pix:'Pix'};
export function enabledPaymentMethods(configuration, mode) {
  if(!configuration?.active||configuration.is_default!==true||configuration.livemode!==(mode==='live'))return [];
  return Object.entries(PAYMENT_NAMES).filter(([key])=>configuration[key]?.available===true&&configuration[key]?.display_preference?.value==='on').map(([id,name])=>({id,name}));
}
let cache=null;
export async function publicPaymentMethods({settings=null,client=null,now=Date.now()}={}) {
  settings??=await billingSettings();
  if(!settings.billing_enabled)return {methods:[],verified:false};
  if(!client&&cache?.mode===settings.billing_mode&&cache.until>now)return cache.value;
  try {
    const stripe=client||await stripeProvider(settings);
    const configurations=await stripe.paymentMethodConfigurations.list({limit:100});
    const configuration=configurations.data.find(row=>row.is_default&&row.active&&row.livemode===(settings.billing_mode==='live'));
    const value={methods:enabledPaymentMethods(configuration,settings.billing_mode),verified:!!configuration};
    if(!client)cache={mode:settings.billing_mode,until:now+300000,value};
    return value;
  }catch{
    const value={methods:[],verified:false};
    if(!client)cache={mode:settings.billing_mode,until:now+30000,value};
    return value;
  }
}
