const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { exportFolder } = require('../../desktop/export-folder.cjs');
const { atomicWrite, validateProjectText } = require('../../desktop/storage.cjs');
const entries = (hook = 'hook A', extra = []) => [{path:'ui.h',data:'public header'},{path:'ui.c',data:'entry point'},{path:'CMakeLists.txt',data:'build config'},{path:'user/game_hooks.c',data:hook},...extra];
async function temporary(run) { const root=await fs.mkdtemp(path.join(os.tmpdir(),'lge-files-'));try{await run(root);}finally{await fs.rm(root,{recursive:true,force:true});} }
test('exports are repeatable and preserve external edits and unrelated files',()=>temporary(async root=>{
  assert.equal((await exportFolder(root,entries(),'project_1')).ok,true);
  await fs.writeFile(path.join(root,'ui/notes.txt'),'my notes');
  await fs.writeFile(path.join(root,'ui/user/game_hooks.c'),'firmware edit');
  const result=await exportFolder(root,entries(),'project_1');
  assert.deepEqual(result.preserved,['user/game_hooks.c']);
  assert.equal(await fs.readFile(path.join(root,'ui/user/game_hooks.c'),'utf8'),'firmware edit');
  assert.equal(await fs.readFile(path.join(root,'ui/notes.txt'),'utf8'),'my notes');
  const conflict=await exportFolder(root,entries('editor edit'),'project_1');
  assert.equal(conflict.ok,false);assert.deepEqual(conflict.conflicts,['user/game_hooks.c']);
  assert.equal(await fs.readFile(path.join(root,'ui/user/game_hooks.c'),'utf8'),'firmware edit');
  assert.equal((await exportFolder(root,entries('editor edit'),'project_1',{replaceModified:true})).ok,true);
  assert.equal(await fs.readFile(path.join(root,'ui/user/game_hooks.c'),'utf8'),'editor edit');
}));
test('removes obsolete generated files only when unchanged',()=>temporary(async root=>{
  await exportFolder(root,entries('hook A',[{path:'generated/old.c',data:'old'},{path:'generated/custom.c',data:'generated'}]),'p');
  await fs.writeFile(path.join(root,'ui/generated/custom.c'),'external');
  const result=await exportFolder(root,entries(),'p');
  assert.deepEqual(result.removed,['generated/old.c']);
  await assert.rejects(fs.stat(path.join(root,'ui/generated/old.c')));
  assert.equal(await fs.readFile(path.join(root,'ui/generated/custom.c'),'utf8'),'external');
}));
test('rejects other projects, unowned folders, traversal and symlinks without touching data',()=>temporary(async root=>{
  await fs.mkdir(path.join(root,'ui'));await fs.writeFile(path.join(root,'ui/ui.h'),'another tool');
  await assert.rejects(exportFolder(root,entries(),'p'),/already contains/);
  assert.equal(await fs.readFile(path.join(root,'ui/ui.h'),'utf8'),'another tool');
  await fs.rm(path.join(root,'ui'),{recursive:true});await exportFolder(root,entries(),'p');
  await assert.rejects(exportFolder(root,entries(),'different'),/different project/);
  await assert.rejects(exportFolder(root,entries('hook',[{path:'../outside.c',data:'bad'}]),'p'),/Invalid export path/);
  await fs.symlink(path.join(root,'outside'),path.join(root,'ui/link'));
  await assert.rejects(exportFolder(root,entries(),'p'),/symbolic link/);
}));
test('a failed directory swap restores the previous complete ui folder',()=>temporary(async root=>{
  await exportFolder(root,entries(),'p');
  const rename=fs.rename;
  fs.rename=async(from,to)=>{if(from.includes('.lge-ui-stage-'))throw new Error('simulated failed publication');return rename(from,to);};
  try{await assert.rejects(exportFolder(root,entries('new hook'),'p'),/failed publication/);}finally{fs.rename=rename;}
  assert.equal(await fs.readFile(path.join(root,'ui/user/game_hooks.c'),'utf8'),'hook A');
  assert.deepEqual((await fs.readdir(root)).filter(n=>n.startsWith('.lge-')),[]);
}));
test('atomic project saves retain a complete document and validate basic file boundaries',()=>temporary(async root=>{
  const project=JSON.stringify({version:1,name:'Saved game',scenes:[]});
  assert.equal(validateProjectText(project).name,'Saved game');
  assert.throws(()=>validateProjectText('{}'),/Invalid/);
  await atomicWrite(path.join(root,'game.lge.json'),project);
  assert.equal(await fs.readFile(path.join(root,'game.lge.json'),'utf8'),project);
  assert.deepEqual((await fs.readdir(root)).filter(n=>n.endsWith('.tmp')),[]);
}));
