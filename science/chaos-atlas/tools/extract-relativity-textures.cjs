#!/usr/bin/env node
/* Rebuild the HTTP JPEG files from the origin-clean file:// bundle. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'assets'),window={};
vm.runInNewContext(fs.readFileSync(path.join(assets,'relativity-textures.js'),'utf8'),{window});
const dest=path.join(assets,'relativity');fs.mkdirSync(dest,{recursive:true});
for(const [name,url] of Object.entries(window.RelativityTextures)){
  if(!/^[a-z]+$/.test(name)||!url.startsWith('data:image/jpeg;base64,'))throw new Error('Unexpected texture bundle entry: '+name);
  const bytes=Buffer.from(url.slice('data:image/jpeg;base64,'.length),'base64');
  fs.writeFileSync(path.join(dest,name+'.jpg'),bytes);console.log(`${name}: ${bytes.length} bytes`);
}
