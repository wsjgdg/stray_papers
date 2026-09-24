"""Download a real 3D galaxy redshift catalog from the VizieR China-VO mirror.

Uses astroquery per the project convention: point every VizieR query at the
domestic mirror so it works behind the GFW / offline-ish sandbox.

Outputs a compact JSON (x,y,z in Mpc) for the Three.js cosmic-web view,
computed from RA/DEC/cz with a flat distance (d = cz / H0, H0 = 70 km/s/Mpc).
"""
import json
import sys
import numpy as np
from astroquery.vizier import Vizier, Conf

# Route all VizieR traffic through the domestic China-VO mirror.
Conf.server = "vizier.china-vo.org"
Vizier.ROW_LIMIT = -1          # no cap; download the full table
Vizier.TIMEOUT = (60, 300)     # (connect, read) seconds

H0 = 70.0  # km/s/Mpc

# Catalogs to try, in priority order. Column names per VizieR (J2000 RA/Dec + cz).
CANDIDATES = [
    ("VII/259", "RAJ2000", "DEJ2000", "cz"),     # 2dF + 6dF merged redshift survey (~125k)
]

def _sex(s):
    """Parse a sexagesimal string '±HH MM SS.ss' to decimal degrees (or hours if caller scales)."""
    s = str(s).strip()
    if not s or s.lower() in ("masked", "nan", ""):
        return float("nan")
    neg = s[0] == "-"
    toks = s[1:] if neg else s
    toks = toks.replace("+", "").split()
    try:
        h = float(toks[0])
        m = float(toks[1]) if len(toks) > 1 else 0.0
        sec = float(toks[2]) if len(toks) > 2 else 0.0
    except (ValueError, IndexError):
        try:
            return float(s)
        except ValueError:
            return float("nan")
    v = h + m / 60.0 + sec / 3600.0
    return -v if neg else v

def parse_ra(s):
    """RA sexagesimal is in HOURS -> convert to degrees (×15)."""
    return _sex(s) * 15.0

def parse_dec(s):
    """Dec sexagesimal is already in DEGREES."""
    return _sex(s)

def to_float_array(col):
    raw = col.tolist()
    out = []
    for x in raw:
        if x is np.ma.masked:
            out.append(float("nan"))
        else:
            try:
                out.append(float(x))
            except (ValueError, TypeError):
                out.append(float("nan"))
    return np.array(out, dtype=float)

def run():
    last_err = None
    for cat, ra_c, dec_c, cz_c in CANDIDATES:
        try:
            print(f"[*] querying {cat} via {Conf.server} ...", flush=True)
            tables = Vizier.query_constraints(catalog=cat)
            if not tables:
                print(f"    no tables returned for {cat}")
                continue
            t = tables[0]
            print(f"[+] got table: {len(t)} rows, columns={t.colnames}")
            def col(name):
                for c in t.colnames:
                    if c.upper() == name.upper():
                        return c
                return None
            ra = col(ra_c); dec = col(dec_c); cz = col(cz_c)
            if not (ra and dec and cz):
                print(f"    missing coord columns (ra={ra} dec={dec} cz={cz}); skipping")
                continue
            ra = np.array([parse_ra(v) for v in t[ra].tolist()], dtype=float)
            dec = np.array([parse_dec(v) for v in t[dec].tolist()], dtype=float)
            czv = to_float_array(t[cz])
            m = np.isfinite(ra) & np.isfinite(dec) & np.isfinite(czv) & (czv > 0)
            ra, dec, czv = ra[m], dec[m], czv[m]
            print(f"[+] usable rows: {len(ra)}")
            ra_r = np.radians(ra); dec_r = np.radians(dec)
            ux = np.cos(dec_r) * np.cos(ra_r)
            uy = np.cos(dec_r) * np.sin(ra_r)
            uz = np.sin(dec_r)
            d = czv / H0  # Mpc (flat: d = cz / H0)
            X = ux * d; Y = uy * d; Z = uz * d

            # Drop cz outliers (physical 2dF/6dF < ~900 Mpc; a few catalog errors reach >16k).
            r = np.sqrt(X*X + Y*Y + Z*Z)
            keep = (r > 3.0) & (r <= 900.0)
            X, Y, Z, r = X[keep], Y[keep], Z[keep], r[keep]
            n = len(X)
            print(f"[+] after filtering d<=900 Mpc: {n} points")

            # Subsample to keep the web render snappy (~60k).
            TARGET = 60000
            if n > TARGET:
                idx = np.random.default_rng(7).choice(n, TARGET, replace=False)
                X, Y, Z, r = X[idx], Y[idx], Z[idx], r[idx]
                n = TARGET
                print(f"[+] subsampled to {n} points")

            # Colour by distance: near = warm white, far = cool blue (depth cue).
            t = np.clip(r / 900.0, 0.0, 1.0)
            near = np.array([1.0, 0.92, 0.78]); far = np.array([0.45, 0.62, 1.0])
            col = near[None, :] * (1 - t)[:, None] + far[None, :] * t[:, None]
            bright = (0.55 + 0.45 * (1 - t))[:, None]
            col = np.clip(col * bright, 0, 1)

            out = {
                "catalog": cat,
                "H0": H0,
                "n": int(n),
                "pos": np.round(np.stack([X, Y, Z], axis=1), 3).ravel().tolist(),
                "col": np.round(col, 3).ravel().tolist(),
            }
            import os
            os.makedirs("public/cosmos", exist_ok=True)
            with open("public/cosmos/cosmic-web.json", "w") as f:
                json.dump(out, f)
            print(f"[+] wrote public/cosmos/cosmic-web.json with {n} points")
            return 0
        except Exception as e:
            last_err = e
            print(f"[!] {cat} failed: {type(e).__name__}: {e}", flush=True)
    print(f"[x] all candidates failed. last error: {last_err}")
    return 1

if __name__ == "__main__":
    sys.exit(run())
