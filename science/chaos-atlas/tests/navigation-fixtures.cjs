'use strict';
// Only nine numbered main experiments belong in the chapter navigation.
// Comparison pages are reachable from their own parent experiment's console.
const main=['index.html','attractors.html','rigid-body.html','henon-heiles.html','vortex-rings.html','turing-patterns.html','lightning.html','ising.html','relativity.html'];
const pages=[...main,'vortex-filament.html','streamer.html'];
module.exports=Object.fromEntries(pages.map(page=>[page,main.filter(other=>other!==page)]));
