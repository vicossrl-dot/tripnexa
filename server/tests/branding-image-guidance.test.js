import test from 'node:test';
import assert from 'node:assert/strict';
import {aspectRatioWarning,brandingImageGuidance} from '../../src/lib/branding-image-guidance.js';

test('Every branding image field has its own requested recommendation',()=>{
 assert.deepEqual(Object.keys(brandingImageGuidance),['logo','dark_logo','light_logo','favicon','email_logo','pdf_logo','social_image']);
 assert.equal(brandingImageGuidance.logo.dimensions,'600 × 180 px');
 assert.equal(brandingImageGuidance.favicon.background,'Square; symbol/icon only, without the wordmark');
 assert.equal(brandingImageGuidance.pdf_logo.dimensions,'800 × 240 px');
 assert.equal(brandingImageGuidance.social_image.formats,'JPG/PNG/WebP');
 for(const guidance of Object.values(brandingImageGuidance))assert.equal(guidance.maxFileSize,'2 MB');
});

test('Aspect ratio guidance warns only for significant non-blocking mismatches',()=>{
 assert.equal(aspectRatioWarning('logo',1200,360),'');
 assert.equal(aspectRatioWarning('logo',1200,1200),'Recommended aspect ratio: 10:3.');
 assert.equal(aspectRatioWarning('favicon',512,512),'');
 assert.equal(aspectRatioWarning('favicon',512,400),'Recommended aspect ratio: 1:1.');
 assert.equal(aspectRatioWarning('social_image',1200,630),'');
 assert.equal(aspectRatioWarning('unknown',1200,630),'');
});