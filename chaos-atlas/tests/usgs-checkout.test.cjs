'use strict';
// The source spectra are verified byte-for-byte. A checkout with Git's
// Windows-style line-ending conversion must not change those bytes.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const gitAvailable=cp.spawnSync('git',['--version'],{stdio:'ignore'}).status===0;

test('USGS source spectra and metadata survive an autocrlf checkout byte-for-byte', {skip:!gitAvailable},()=>{
  const source=path.resolve(__dirname,'../data/usgs-splib07a');
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'chaos-usgs-checkout-'));
  const repo=path.join(tmp,'repo'),out=path.join(tmp,'checkout');fs.mkdirSync(repo);fs.mkdirSync(out);
  const config=path.join(tmp,'empty-gitconfig');fs.writeFileSync(config,'');
  const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:config};
  const git=(...args)=>cp.execFileSync('git',args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});
  try{
    const files=fs.readdirSync(source).filter(name=>/^splib07a_.*\.txt$/.test(name)||name.endsWith('.html'));
    assert.equal(files.length,7);fs.copyFileSync(path.join(source,'.gitattributes'),path.join(repo,'.gitattributes'));
    for(const file of files)fs.copyFileSync(path.join(source,file),path.join(repo,file));
    git('init','--quiet');git('-c','core.autocrlf=true','add','--','.gitattributes',...files);
    git('-c','core.autocrlf=true','checkout-index','--prefix='+out+path.sep,'--all');
    for(const file of files){
      const original=fs.readFileSync(path.join(source,file));
      assert.deepEqual(git('show',':'+file),original,`${file}: staged bytes changed`);
      assert.deepEqual(fs.readFileSync(path.join(out,file)),original,`${file}: checkout bytes changed`);
    }
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
