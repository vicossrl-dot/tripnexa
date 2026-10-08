import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePublicSettings,resolveBrandMark} from '../../src/lib/public-settings.js';

test('Configured public logo resolves to an accessible image mark',()=>{
 const settings=normalizePublicSettings({branding:{app_name:'TripNexa',logo:'/brand-assets/logo.png'}});
 assert.deepEqual(resolveBrandMark(settings.branding),{type:'image',src:'/brand-assets/logo.png',alt:'TripNexa'});
});

test('Empty logo preserves the Compass wordmark fallback',()=>{
 const settings=normalizePublicSettings({branding:{app_name:'TripNexa',logo:''}});
 assert.deepEqual(resolveBrandMark(settings.branding),{type:'fallback',appName:'TripNexa',wordmark:'TripNexa.'});
});

test('Unavailable public settings preserve the default fallback',()=>{
 const settings=normalizePublicSettings(null);
 assert.deepEqual(resolveBrandMark(settings.branding),{type:'fallback',appName:'TripNexa',wordmark:'TripNexa.'});
});

test('Configured app name drives fallback text and failed images fall back',()=>{
 const settings=normalizePublicSettings({branding:{app_name:'Wanderly',logo:'/brand-assets/logo.png'}});
 assert.deepEqual(resolveBrandMark(settings.branding,true),{type:'fallback',appName:'Wanderly',wordmark:'Wanderly.'});
});