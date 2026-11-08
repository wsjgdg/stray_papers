#!/usr/bin/env python3
"""Rebuild the offline JS from the four unmodified USGS ASCII files.

Source: USGS Spectral Library v7, splib07a (native ASD channels), CC0 1.0.
Data release DOI: 10.5066/F7RR1WDJ; see data/usgs-splib07a/README.md.
This intentionally does NOT smooth, normalize or downsample the measurements.
"""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parent.parent
data = root / 'data' / 'usgs-splib07a'
files = {
    'wavelengths': ('splib07a_Wavelengths_ASD_0.35-2.5_microns_2151_ch.txt', '57f67300f64ae49fcb8bf5a967cf097e978317047e13e8baf476e2f62af9a23c'),
    'usgs-paint': ('splib07a_Painted_Aluminum_GDS333_LgGr_ASDFRa_AREF.txt', '0af50ab8ad3dbd00560808e05905aaad382e465905354d264c51a46afbf0f5d4'),
    'usgs-pine': ('splib07a_Plywood_GDS365_Fresh_Pine_ASDFRa_AREF.txt', '179430d3ddb15e024b6b8349ca30e672609e6e92943149acd9fc988eb2eb5246'),
    'usgs-nylon': ('splib07a_Nylon_Fabric_GDS431_Red_RpSt_ASDFRa_AREF.txt', '07b6c93d70476c3ff41cdb2507caad8d17bb0b74a4211fd7ee2217fa3a738a93'),
}
raw = {}
for key, (name, expected) in files.items():
    file = data / name
    content = file.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError('Unrecognized original file: ' + name)
    values = [float(v) for v in content.decode('ascii').splitlines()[1:]]
    if len(values) != 2151 or any(x < 0 for x in values):
        raise ValueError('Missing / invalid ASD bands: ' + name)
    # USGS wavelength file is in micrometres; convert each original sample
    # position to nm, retaining its recorded floating-point value.
    raw[key] = [v * 1000 if key == 'wavelengths' else v for v in values]
if any(a >= b for a, b in zip(raw['wavelengths'], raw['wavelengths'][1:])):
    raise ValueError('Wavelengths not strictly increasing')
output = '''/* Generated from unmodified USGS splib07a ASCII; see data/usgs-splib07a.
 * Kokaly et al. (2017), DOI 10.5066/F7RR1WDJ, CC0 1.0. Run
 * python3 scripts/extract-usgs-spectra.py to reproduce this exact file.
 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RelativityMeasuredData=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const data=DATA;
  Object.values(data).forEach(Object.freeze);
  return Object.freeze(data);
});
'''.replace('DATA', json.dumps(raw, separators=(',', ':'), ensure_ascii=True))
target = root / 'relativity-measured-data.js'
if '--check' in sys.argv:
    if target.read_text(encoding='utf-8') != output:
        raise SystemExit('Generated measurement data does not match originals')
else:
    target.write_text(output, encoding='utf-8')
