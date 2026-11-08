/* HTTP pages load individual local JPEGs rather than parsing a multi-megabyte
 * inline script. file:// uses the embedded data URLs to remain origin-clean. */
(function(root){
  'use strict';
  if(root.location.protocol==='file:'){
    root.RelativityTextureReady=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='assets/relativity-textures.js?v=20261105-10';
      script.onload=resolve;script.onerror=()=>reject(new Error('本地材质加载失败'));
      document.head.appendChild(script);
    });
  }else{
    const names=['sky','stone','crate','facade','asphalt','wall','mountains','harborSky','harborMetal'];
    root.RelativityTextures=Object.freeze(Object.fromEntries(names.map(name=>[name,'assets/relativity/'+name+'.jpg?v=20261105-10'])));
    root.RelativityTextureReady=Promise.resolve();
  }
})(window);
