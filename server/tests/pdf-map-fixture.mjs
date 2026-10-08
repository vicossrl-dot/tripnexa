import pngjs from 'pngjs';
export function fixtureMapPng(width=600,height=220){
 const png=new pngjs.PNG({width,height});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const index=(y*width+x)*4,line=x%60<2||y%55<2;png.data.set(line?[175,180,170,255]:[243,245,239,255],index);}
 return pngjs.PNG.sync.write(png);
}
export function fixtureMapProvider(){
 const dataUrl='data:image/png;base64,'+fixtureMapPng().toString('base64');
 return {name:'Test fixture imagery — not a live map service',dataSource:'openstreetmap',printLicense:{permitsCustomerPdfs:true,url:'https://opendatacommons.org/licenses/odbl/1-0/'},attribution:[{text:'Fixture imagery only',url:'https://example.org/fixture'}],render:async({viewport})=>({dataUrl,viewport})};
}
export const pdfMapDay={date:'2026-10-07',stops:[
 {kind:'stay',name:'Hotel',position:{lat:35.002,lng:135.765}},
 {kind:'visit',name:'Museum',number:1,position:{lat:35.008,lng:135.771}},
 {kind:'visit',name:'Tenryū-ji',number:2,position:null},
 {kind:'visit',name:'Garden',number:3,position:{lat:35.012,lng:135.754}}
]};
