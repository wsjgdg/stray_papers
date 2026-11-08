/* Approximate surface response. Texture RGB is display-referred, not measured
 * albedo or HDR. GGX highlights and sky-map reflections are illustrative;
 * no global illumination, transmission or measured material BRDF is implied. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./relativity-spectrum.js'));
  else root.RelativitySurface=factory(root.RelativitySpectrum);
})(typeof globalThis==='object'?globalThis:this,function(S){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const profiles=Object.freeze({
    matte:Object.freeze([.86,0]),wood:Object.freeze([.72,0]),paint:Object.freeze([.38,.16]),
    metal:Object.freeze([.32,.75]),glass:Object.freeze([.17,.08]),rubber:Object.freeze([.93,0])
  });
  function profile(material,environment){
    if(material===4){
      return environment==='station'?profiles.matte:environment==='street'?profiles.matte:environment==='corridor'?profiles.paint:environment==='harbor'?profiles.metal:profiles.wood;
    }
    if([18,26,47].includes(material))return profiles.glass;
    if([25,43].includes(material))return profiles.paint;
    if([2,10,19,20,23,31,33,36,38,40,41,42,45,46].includes(material))return profiles.metal;
    if([6,32,34].includes(material))return profiles.wood;
    if([27,35].includes(material))return profiles.rubber;
    return profiles.matte;
  }
  // Regularized inverse square: the point light is normalized to 1 at 5 units,
  // softened within one unit and capped near the source. Directional = 1.
  function attenuation(light){
    if(!light||!Number.isFinite(light.distance)||light.distance>1e10||light.kind==='directional'||light.kind==='extended-directional')return 1;
    return Math.min(2,26/(light.distance*light.distance+1));
  }
  // Directional ambient fill is a cheap sky/ground hemisphere approximation,
  // not traced indirect light. Down-facing surfaces receive less sky fill.
  function ambient(normal,environment){
    const up=clamp(.5+.5*normal[1],0,1),indoor=environment==='station'||environment==='corridor';
    return indoor?.64+.06*up:.49+.14*up;
  }
  // Avoid treating enclosed architecture as if it were a hazy outdoor scene.
  // This is an artistic distance cue, not calibrated atmospheric scattering.
  function fog(distance,environment){
    const indoor=environment==='station'||environment==='corridor',density=environment==='corridor'?.0015:environment==='station'?.0025:.012;
    return clamp(1-Math.exp(-distance*density),0,indoor?.12:.34);
  }
  function highlight(rgb,normal,light,view,material,environment,roughnessScale=1,visible=1){
    const [rough,metal]=profile(material,environment),r=clamp(rough*roughnessScale,.08,1),nl=Math.max(0,normal[0]*light.direction[0]+normal[1]*light.direction[1]+normal[2]*light.direction[2]),nv=Math.max(0,normal[0]*view[0]+normal[1]*view[1]+normal[2]*view[2]);
    if(nl<=0||nv<=0||visible<=0)return [0,0,0];
    const h=[light.direction[0]+view[0],light.direction[1]+view[1],light.direction[2]+view[2]],hlen=Math.hypot(...h);if(hlen<1e-12)return [0,0,0];for(let i=0;i<3;i++)h[i]/=hlen;
    const nh=Math.max(0,normal[0]*h[0]+normal[1]*h[1]+normal[2]*h[2]),vh=Math.max(0,view[0]*h[0]+view[1]*h[1]+view[2]*h[2]);
    const alpha=r*r,a2=alpha*alpha,d=nh*nh*(a2-1)+1,D=a2/(Math.PI*d*d),k=(r+1)**2/8;
    const G=(nv/(nv*(1-k)+k))*(nl/(nl*(1-k)+k)),strength=Math.min(4,D*G/(4*nv+1e-5)*attenuation(light)*visible*.35),f=(1-vh)**5;
    return rgb.map(v=>{const base=S.srgbToLinear(clamp(v,0,1)),f0=.04*(1-metal)+base*metal;return strength*(f0+(1-f0)*f);});
  }
  function environment(rgb,sky,material,world,roughnessScale=1){
    const [rough,metal]=profile(material,world),r=clamp(rough*roughnessScale,.08,1),amount=(metal+(material===18||material===26||material===47?.18:0))*.12*(1-r);
    return rgb.map((v,i)=>S.srgbToLinear(clamp(sky[i],0,1))*S.srgbToLinear(clamp(v,0,1))*amount);
  }
  return Object.freeze({profile,attenuation,ambient,fog,highlight,environment});
});
