import getyourguide from './getyourguide.js';
import viator from './viator.js';
import tiqets from './tiqets.js';
import klook from './klook.js';
import {createProvider} from './provider-base.js';
export const definitions=[getyourguide,viator,tiqets,klook];
export const adapter=(id,config)=>createProvider(definitions.find(p=>p.id===id),config);
