"""Rebuild the offline teaching spectra; runtime does not need Python.

Requires numpy, scipy, colour-science (the data were generated with
numpy 2.4.6, scipy 1.17.1 and colour-science 0.4.7). Uses CIE 1931 2°
CMFs at 380–780 nm in 5 nm steps. The seven nonnegative basis spectra
are an explicit *metameric assumption*, not recovered material spectra.
"""
from pathlib import Path
import json
import numpy as np
import colour
from scipy.optimize import lsq_linear

w = np.arange(380, 781, 5)
cmf = np.array([colour.MSDS_CMFS['CIE 1931 2 Degree Standard Observer'][float(n)] for n in w])
d65 = np.array([colour.SDS_ILLUMINANTS['D65'][float(n)] for n in w])
A = cmf.T * 5.0
rgb_to_xyz = np.array([[.4124564,.3575761,.1804375], [.2126729,.7151522,.0721750], [.0193339,.1191920,.9503041]])
sigmoid = lambda x, k: 1 / (1 + np.exp(-x/k))
red = sigmoid(w-585, 24)
blue = sigmoid(500-w, 18)
green = sigmoid(w-480, 17) * sigmoid(600-w, 25)
priors = [np.ones_like(w), 1-red, 1-green, 1-blue, red, green, blue]
targets = np.array([[1,1,1],[0,1,1],[1,0,1],[1,1,0],[1,0,0],[0,1,0],[0,0,1]])
d2 = np.diff(np.eye(len(w)), n=2, axis=0)
B = np.vstack([A*400, d2*150, np.eye(len(w))*8])
spectra = []
for prior, rgb in zip(priors, targets):
    xyz = rgb_to_xyz @ rgb
    prior = d65 * prior
    prior = prior * xyz[1] / (A[1] @ prior)
    rhs = np.concatenate([xyz*400, np.zeros(len(w)-2), prior*8])
    spectra.append(lsq_linear(B, rhs, bounds=(0, np.inf), tol=1e-11, max_iter=400).x)

def compact(data):
    return json.dumps(np.round(data, 10).tolist(), separators=(',',':'))

out = '''/* Offline CIE 1931 2° CMFs and seven nonnegative illustrative spectra.\n * CIE DOI: 10.25039/CIE.DS.rmcs7wkw. Source: colour-science (BSD-3-Clause);\n * see assets/relativity-cie-LICENSE.txt and tools/build-relativity-spectrum.py. */\n(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RelativitySpectrumData=factory();})(typeof globalThis==='object'?globalThis:this,function(){\n'use strict';\n'''
out += 'const cie='+compact(cmf)+';\nconst basis='+compact(np.array(spectra))+';\n'
out += 'return Object.freeze({cie,basis});\n});\n'
Path(__file__).resolve().parents[1].joinpath('relativity-spectrum-data.js').write_text(out, encoding='utf-8')
