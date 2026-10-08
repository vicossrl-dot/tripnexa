export const brandingImageGuidance={
 logo:{dimensions:'600 × 180 px',formats:'PNG/WebP',background:'Transparent background',aspectRatio:10/3,aspectLabel:'10:3',maxFileSize:'2 MB'},
 dark_logo:{dimensions:'600 × 180 px',formats:'PNG/WebP',background:'Transparent background',aspectRatio:10/3,aspectLabel:'10:3',maxFileSize:'2 MB'},
 light_logo:{dimensions:'600 × 180 px',formats:'PNG/WebP',background:'Transparent background',aspectRatio:10/3,aspectLabel:'10:3',maxFileSize:'2 MB'},
 favicon:{dimensions:'512 × 512 px',formats:'PNG/WebP',background:'Square; symbol/icon only, without the wordmark',aspectRatio:1,aspectLabel:'1:1',maxFileSize:'2 MB'},
 email_logo:{dimensions:'600 × 180 px',formats:'PNG/WebP',background:'Transparent background',aspectRatio:10/3,aspectLabel:'10:3',maxFileSize:'2 MB'},
 pdf_logo:{dimensions:'800 × 240 px',formats:'PNG/WebP',background:'Transparent background',aspectRatio:10/3,aspectLabel:'approximately 10:3',maxFileSize:'2 MB'},
 social_image:{dimensions:'1200 × 630 px',formats:'JPG/PNG/WebP',background:'',aspectRatio:1.91,aspectLabel:'1.91:1',maxFileSize:'2 MB'},
};

export function aspectRatioWarning(key,width,height){
 const guidance=brandingImageGuidance[key];
 if(!guidance||!guidance.aspectRatio||!width||!height)return '';
 const actual=width/height;
 return Math.abs(actual/guidance.aspectRatio-1)>0.1?`Recommended aspect ratio: ${guidance.aspectLabel}.` : '';
}