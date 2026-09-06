import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seedMaterialsIfEmpty } from '@/lib/seed-data'
import { clearAll } from '@/lib/cache'
import { apiError } from '@/lib/api-error'
import { rateLimit, getIdentifier, RATE_LIMITS } from '@/lib/rate-limit'

// POST /api/demo/seed
// -----------------------------------------------------------------------------
// One-click "demo experience" loader.
//
// Populates a complete, realistic dataset so a brand-new user can see the full
// MatLit Miner product experience in ~30 seconds without invoking external
// scholarly APIs or paying LLM tokens. Idempotent: every record is keyed by a
// stable `demo-*` id so re-running the endpoint updates in place instead of
// duplicating rows.
//
// Dataset shape:
//   - Materials: 60 base materials (calls seedMaterialsIfEmpty when <10 exist)
//   - Papers:    ~5 demo papers × 10 key materials = 50 papers
//   - Classifications: one per demo paper (synthesized / bandgap / method /
//     efficiency / evidence / confidence 0.70–0.95)
//   - Extractions: papers with synthesized=yes get status='extracted'
//   - Efficiencies: 10 NREL/literature benchmark records
//   - Verifications: 4 verified + 1 flagged
// -----------------------------------------------------------------------------

interface DemoPaper {
  idx: number
  materialName: string
  title: string
  year: number
  doi: string
  venue: string
  authors: string
  abstract: string
  citations: number
  // classification payload
  synthesized: 'yes' | 'no' | 'uncertain'
  bandgapValue: string
  synthesisMethod: string
  conditions: string
  efficiencyValue: string
  evidence: string
  confidence: number
}

const SLUG_MAP: Record<string, string> = {
  MAPbI3: 'mapbi3',
  FAPbI3: 'fapbi3',
  CsPbI3: 'cspbi3',
  MAPbBr3: 'mapbbr3',
  'Cs2AgBiBr6': 'cs2agbibr6',
  'Cu2ZnSnSe4': 'cu2znsnse4',
  'Sb2Se3': 'sb2se3',
  'BiFeO3': 'bifeo3',
  TiO2: 'tio2',
  MASnI3: 'masni3',
}

function slugFor(name: string): string {
  return SLUG_MAP[name] ?? name.toLowerCase().replace(/[^a-z0-9]/gi, '')
}

// 50 realistic demo papers (5 per material × 10 materials). DOIs are
// intentionally synthetic (`10.demo/…`) so they never collide with real
// records imported from scholarly sources.
const DEMO_PAPERS: DemoPaper[] = [
  // ----- MAPbI3 (5) -----
  {
    idx: 1, materialName: 'MAPbI3', year: 2019,
    title: 'A p-i-n structured MAPbI3 perovskite solar cell with 21.6% certified efficiency via Lewis-base additives',
    doi: '10.demo/mapbi3.2019.001', venue: 'Nature Energy', authors: 'Saliba, M.; Matsui, T.; Seo, J.-Y.; Zakeeruddin, S. M.; Correa-Baena, J.-P.; Grätzel, M.',
    abstract: 'We report methylammonium lead triiodide (MAPbI3) solar cells with a certified power conversion efficiency of 21.6%. Lewis-base additives (sulfonium, DMSO) retard crystallization during the one-step spin-coating with anti-solvent dripping, yielding pinhole-free films with millimetre-scale grains. Devices exhibit a Voc of 1.12 V, Jsc of 24.8 mA/cm² and fill factor of 0.78. The bandgap is 1.55 eV. Stability tests show 95% retention after 500 h under 1-sun illumination.',
    citations: 1240,
    synthesized: 'yes', bandgapValue: '1.55 eV', synthesisMethod: 'one-step spin coating with anti-solvent (chlorobenzene) quenching',
    conditions: 'N2 glovebox, 100 °C anneal 30 min', efficiencyValue: '21.6%',
    evidence: 'certified power conversion efficiency of 21.6% … bandgap is 1.55 eV', confidence: 0.93,
  },
  {
    idx: 2, materialName: 'MAPbI3', year: 2020,
    title: 'Compositional engineering of MAPbI3 with rubidium cesium co-doping for >23% efficient p-i-n devices',
    doi: '10.demo/mapbi3.2020.002', venue: 'Science', authors: 'Jeon, N. J.; Noh, J. H.; Yang, W. S.; Kim, Y. C.; Ryu, S.; Seo, J.; Seok, S. I.',
    abstract: 'Triple-cation (Rb/Cs/MA) perovskite derived from MAPbI3 achieves a stabilized efficiency of 23.4%. XRD shows the photoactive α-phase with no detectable δ-phase impurity. The films were deposited by spin-coating a DMF:DMSO precursor followed by toluene dripping. Devices retain 90% PCE after 250 h thermal stress at 85 °C.',
    citations: 2105,
    synthesized: 'yes', bandgapValue: '1.55 eV', synthesisMethod: 'spin-coating with toluene anti-solvent',
    conditions: 'DMF:DMSO solvent, 100 °C anneal', efficiencyValue: '23.4%',
    evidence: 'stabilized efficiency of 23.4% … α-phase with no detectable δ-phase', confidence: 0.91,
  },
  {
    idx: 3, materialName: 'MAPbI3', year: 2018,
    title: 'In situ GIWAXS observation of MAPbI3 crystallization kinetics during solvent engineering',
    doi: '10.demo/mapbi3.2018.003', venue: 'Advanced Materials', authors: 'Stone, K. H.; Gold-Parker, A.; Toney, M. F.; McGehee, M. D.',
    abstract: 'Using in situ grazing-incidence wide-angle X-ray scattering, we track the formation of MAPbI3 from a precursor solution during spin-coating and anti-solvent dripping. The intermediate (MA)2Pb3I8·2DMSO phase converts to α-MAPbI3 within 30 s at room temperature before thermal annealing. Bandgap is measured at 1.55 eV by UV-vis. No device results are reported in this study.',
    citations: 487,
    synthesized: 'yes', bandgapValue: '1.55 eV', synthesisMethod: 'spin-coating with chlorobenzene anti-solvent',
    conditions: 'in situ GIWAXS, RT anneal', efficiencyValue: '',
    evidence: 'bandgap is measured at 1.55 eV … intermediate (MA)2Pb3I8·2DMSO phase', confidence: 0.88,
  },
  {
    idx: 4, materialName: 'MAPbI3', year: 2021,
    title: 'First-principles modelling of defect tolerance in methylammonium lead triiodide',
    doi: '10.demo/mapbi3.2021.004', venue: 'Journal of Physical Chemistry C', authors: 'Brandt, R. E.; Stevanović, V.; Ginley, D. S.; Buonassisi, T.',
    abstract: 'Hybrid DFT calculations identify the dominant iodine interstitial defect in MAPbI3 and quantify its low formation energy (0.14 eV) but benign deep-state character. The computed bandgap is 1.58 eV (PBE+SOC) and 1.65 eV (HSE06+SOC). The paper presents computational results only — no experimental synthesis.',
    citations: 312,
    synthesized: 'no', bandgapValue: '1.58 eV (PBE+SOC)', synthesisMethod: '',
    conditions: 'DFT calculation, 0 K', efficiencyValue: '',
    evidence: 'computed bandgap is 1.58 eV … computational results only', confidence: 0.84,
  },
  {
    idx: 5, materialName: 'MAPbI3', year: 2022,
    title: 'Long-term stability of encapsulated MAPbI3 modules under ISOS-L-2 protocol',
    doi: '10.demo/mapbi3.2022.005', venue: 'Joule', authors: 'Khenkin, M. V.; Katz, E. A.; Abate, A.; Briotta, G.',
    abstract: 'Encapsulated 10 cm × 10 cm MAPbI3 mini-modules sustain 90% of initial efficiency (T90) after 1500 h under ISOS-L-2 damp-heat cycling. Edge sealant chemistry and barrier water-vapour transmission rate were varied. Initial champion efficiency was 17.2%. Bandgap 1.55 eV confirmed by external quantum efficiency.',
    citations: 218,
    synthesized: 'yes', bandgapValue: '1.55 eV', synthesisMethod: 'blade coating of MAPbI3 precursor',
    conditions: 'encapsulated, ISOS-L-2', efficiencyValue: '17.2%',
    evidence: 'T90 after 1500 h … champion efficiency was 17.2%', confidence: 0.86,
  },

  // ----- FAPbI3 (5) -----
  {
    idx: 1, materialName: 'FAPbI3', year: 2021,
    title: 'Stabilized α-phase FAPbI3 solar cells with 24.2% certified efficiency using 2D capping layers',
    doi: '10.demo/fapbi3.2021.001', venue: 'Nature', authors: 'Min, H.; Lee, D. Y.; Kim, J.; Kim, G.; Lee, K. S.; Kim, J.; Seok, S. I.',
    abstract: 'A 2D perovskite capping layer suppresses non-radiative recombination in α-FAPbI3, yielding a certified 24.2% efficient solar cell. The α-phase is stabilized at room temperature by formamidine acetate additive. Bandgap 1.48 eV, Voc 1.18 V, Jsc 26.2 mA/cm². Unencapsulated devices retain 90% PCE after 600 h illumination.',
    citations: 1820,
    synthesized: 'yes', bandgapValue: '1.48 eV', synthesisMethod: 'spin-coating with formamidine acetate additive',
    conditions: 'N2, 150 °C anneal 10 min', efficiencyValue: '24.2%',
    evidence: 'certified 24.2% efficient solar cell … bandgap 1.48 eV', confidence: 0.94,
  },
  {
    idx: 2, materialName: 'FAPbI3', year: 2020,
    title: 'Phase-pure α-FAPbI3 via vacuum deposition for scalable perovskite photovoltaics',
    doi: '10.demo/fapbi3.2020.002', venue: 'Nature Communications', authors: 'Liu, M.; Johnston, M. B.; Snaith, H. J.',
    abstract: 'Thermal co-evaporation of FAI and PbI2 produces phase-pure α-FAPbI3 thin films over 100 cm² substrates. XRD confirms complete suppression of the δ-phase. Bandgap 1.48 eV. Champion cell efficiency 18.3%, with notable uniformity (std-dev < 0.4% absolute) across a 5 cm × 5 cm substrate.',
    citations: 765,
    synthesized: 'yes', bandgapValue: '1.48 eV', synthesisMethod: 'thermal co-evaporation (FAI + PbI2)',
    conditions: 'high vacuum, 150 °C substrate', efficiencyValue: '18.3%',
    evidence: 'phase-pure α-FAPbI3 … efficiency 18.3%', confidence: 0.89,
  },
  {
    idx: 3, materialName: 'FAPbI3', year: 2019,
    title: 'Solvent engineering for α-phase FAPbI3: kinetic vs thermodynamic control',
    doi: '10.demo/fapbi3.2019.003', venue: 'Energy & Environmental Science', authors: 'Eperon, G. E.; Stranks, S. D.; Snaith, H. J.',
    abstract: 'We investigate the role of methylamine gas in inducing the photoactive α-FAPbI3 phase at room temperature. Combined UV-vis and photoluminescence show a bandgap of 1.48 eV. Devices reach 16.0% efficiency but suffer rapid phase reversion under humid air. Method details for methylamine gas treatment are given.',
    citations: 542,
    synthesized: 'yes', bandgapValue: '1.48 eV', synthesisMethod: 'methylamine gas-induced phase transition',
    conditions: 'methylamine atmosphere, RT', efficiencyValue: '16.0%',
    evidence: 'bandgap of 1.48 eV … efficiency 16.0%', confidence: 0.87,
  },
  {
    idx: 4, materialName: 'FAPbI3', year: 2022,
    title: 'Defect-engineered FAPbI3 single crystals for X-ray detection with suppressed ion migration',
    doi: '10.demo/fapbi3.2022.004', venue: 'Advanced Functional Materials', authors: 'Wei, H.; Huang, J.; Fang, Y.; Zhang, H.',
    abstract: 'Solution-grown FAPbI3 single crystals with PbI2-rich stoichiometry show μτ product of 1.2 × 10⁻³ cm² V⁻¹ and detect 8 keV Cu Kα X-rays at 1.3 nGy/s. Bandgap 1.48 eV. No photovoltaic device is fabricated here; the work focuses on detector performance.',
    citations: 188,
    synthesized: 'yes', bandgapValue: '1.48 eV', synthesisMethod: 'inverse temperature crystallization',
    conditions: 'solution growth, 95 °C', efficiencyValue: '',
    evidence: 'μτ product of 1.2 × 10⁻³ cm² V⁻¹ … bandgap 1.48 eV', confidence: 0.82,
  },
  {
    idx: 5, materialName: 'FAPbI3', year: 2023,
    title: 'Lattice dynamics and polymorphism of FAPbI3 from inelastic neutron scattering',
    doi: '10.demo/fapbi3.2023.005', venue: 'Chemistry of Materials', authors: 'Whitfield, P. S.; Huq, A.; Schatte, G.',
    abstract: 'Variable-temperature neutron diffraction from 4 K to 600 K reveals four phases of FAPbI3, including a previously unreported low-temperature β-phase below 140 K. The α↔δ transition at 425 K shows 0.6% volume change. No synthesis method described — sample provided by external collaborator. No device results.',
    citations: 96,
    synthesized: 'uncertain', bandgapValue: '', synthesisMethod: '',
    conditions: 'neutron diffraction, 4–600 K', efficiencyValue: '',
    evidence: 'four phases of FAPbI3 … sample provided by external collaborator', confidence: 0.71,
  },

  // ----- CsPbI3 (5) -----
  {
    idx: 1, materialName: 'CsPbI3', year: 2021,
    title: 'All-inorganic γ-CsPbI3 solar cells with 20.4% certified efficiency via HPB additive',
    doi: '10.demo/cspbi3.2021.001', venue: 'Nature', authors: 'Wang, Y.; Dar, M. I.; Ono, L. K.; Zhang, T.; Grätzel, M.; Qi, Y.',
    abstract: 'A hypophosphorous acid (HPB) additive enables phase-stable γ-CsPbI3 thin films that retain their black perovskite phase for months under ambient conditions. Certified efficiency reaches 20.4%. Bandgap 1.73 eV, Voc 1.25 V, Jsc 21.4 mA/cm². T80 > 500 h under continuous 1-sun illumination.',
    citations: 1340,
    synthesized: 'yes', bandgapValue: '1.73 eV', synthesisMethod: 'spin-coating with HPB additive',
    conditions: 'N2, 100 °C anneal 10 min', efficiencyValue: '20.4%',
    evidence: 'Certified efficiency reaches 20.4% … bandgap 1.73 eV', confidence: 0.93,
  },
  {
    idx: 2, materialName: 'CsPbI3', year: 2020,
    title: 'CsPbI3 quantum dots for high-open-circuit-voltage photovoltaics',
    doi: '10.demo/cspbi3.2020.002', venue: 'ACS Energy Letters', authors: 'Swarnkar, A.; Marshall, A. R.; Sanehira, E. M.; Luther, J. M.',
    abstract: 'Colloidal CsPbI3 quantum dots (8 nm diameter) deliver a Voc of 1.23 V and PCE of 13.4%. The dots are synthesized via hot injection of Cs-oleate into PbI2/oleic acid/oleylamine at 170 °C. Optical bandgap is 1.73 eV. Air-stable for >30 days when passivated with PbBr2.',
    citations: 894,
    synthesized: 'yes', bandgapValue: '1.73 eV', synthesisMethod: 'hot-injection colloidal synthesis',
    conditions: 'N2, 170 °C', efficiencyValue: '13.4%',
    evidence: 'Voc of 1.23 V and PCE of 13.4% … bandgap is 1.73 eV', confidence: 0.88,
  },
  {
    idx: 3, materialName: 'CsPbI3', year: 2019,
    title: 'Thermodynamic stability of γ-CsPbI3 from high-throughput DFT screening',
    doi: '10.demo/cspbi3.2019.003', venue: 'Chemistry of Materials', authors: 'Marronnier, A.; Roma, G.; Boyer-Richard, S.; Pedesseau, L.; Katan, C.; Even, J.',
    abstract: 'DFT calculations of the CsPbI3 polymorph energy landscape show that the γ-phase is metastable (ΔE = 36 meV/atom above the yellow δ-phase at 0 K). The PBE+SOC bandgap is 1.78 eV. The paper proposes bromide alloying as a route to stabilize γ-CsPbI3. Computational only — no experiments.',
    citations: 421,
    synthesized: 'no', bandgapValue: '1.78 eV (PBE+SOC)', synthesisMethod: '',
    conditions: 'DFT, 0 K', efficiencyValue: '',
    evidence: 'γ-phase is metastable (ΔE = 36 meV/atom) … PBE+SOC bandgap is 1.78 eV', confidence: 0.86,
  },
  {
    idx: 4, materialName: 'CsPbI3', year: 2022,
    title: 'Vapor-deposited CsPbI3 films for tandem top cells: phase control via substrate temperature',
    doi: '10.demo/cspbi3.2022.004', venue: 'Joule', authors: 'Zhao, P.; Lin, Z.; Wang, J.; Yue, M.; Su, J.; Zhang, J.',
    abstract: 'Single-source thermal evaporation of CsPbI3 yields phase-pure γ-phase films when substrate temperature is held at 100 °C during deposition. Bandgap 1.73 eV. Champion single-junction device reaches 16.1% PCE and the films serve as a 1.78 eV top cell in a 4-terminal silicon tandem (26.3% combined).',
    citations: 234,
    synthesized: 'yes', bandgapValue: '1.73 eV', synthesisMethod: 'single-source thermal evaporation',
    conditions: 'high vacuum, 100 °C substrate', efficiencyValue: '16.1%',
    evidence: 'phase-pure γ-phase films … 16.1% PCE', confidence: 0.85,
  },
  {
    idx: 5, materialName: 'CsPbI3', year: 2018,
    title: 'Photoluminescence blinking in individual CsPbI3 nanocrystals',
    doi: '10.demo/cspbi3.2018.005', venue: 'Nano Letters', authors: 'Yin, W.; Li, H.; Tong, G.; Zhu, L.; Tang, H.',
    abstract: 'Single-particle photoluminescence spectroscopy reveals fluorescence blinking in CsPbI3 nanocrystals attributed to surface trap-mediated Auger recombination. No bulk film or device is studied. Emission peak at 698 nm (1.78 eV).',
    citations: 178,
    synthesized: 'uncertain', bandgapValue: '1.78 eV', synthesisMethod: 'colloidal synthesis (details in cited ref)',
    conditions: 'RT, single-particle PL', efficiencyValue: '',
    evidence: 'emission peak at 698 nm (1.78 eV)', confidence: 0.72,
  },

  // ----- MAPbBr3 (5) -----
  {
    idx: 1, materialName: 'MAPbBr3', year: 2018,
    title: 'Wide-bandgap MAPbBr3 solar cells for semi-transparent building-integrated photovoltaics',
    doi: '10.demo/mapbbr3.2018.001', venue: 'Solar Energy Materials and Solar Cells', authors: 'Edri, E.; Kirmayer, S.; Cahen, D.; Hodes, G.',
    abstract: 'Solution-processed MAPbBr3 solar cells with a bandgap of 2.30 eV reach a champion PCE of 9.2% and average visible transmittance of 31%. Devices use PEDOT:PSS/Au contacts in a p-i-n architecture. Films are deposited by one-step spin-coating from DMF with chlorobenzene dripping.',
    citations: 412,
    synthesized: 'yes', bandgapValue: '2.30 eV', synthesisMethod: 'one-step spin coating, chlorobenzene anti-solvent',
    conditions: 'air, 100 °C anneal', efficiencyValue: '9.2%',
    evidence: 'champion PCE of 9.2% … bandgap of 2.30 eV', confidence: 0.89,
  },
  {
    idx: 2, materialName: 'MAPbBr3', year: 2019,
    title: 'MAPbBr3 single crystals: growth, anisotropic mobility and X-ray detection',
    doi: '10.demo/mapbbr3.2019.002', venue: 'Advanced Materials', authors: 'Saidaminov, M. I.; Haque, M. A.; Bakr, O. M.; Tisdale, W. A.',
    abstract: 'Inverse-temperature crystallization yields centimetre-scale MAPbBr3 single crystals with a hole mobility of 24 cm² V⁻¹ s⁻¹ and μτ product of 1.8 × 10⁻² cm² V⁻¹. Optical bandgap is 2.30 eV. Photodetector responsivity reaches 84 A/W at 5 V bias under 0.1 μW/cm² green light. No PV device reported.',
    citations: 587,
    synthesized: 'yes', bandgapValue: '2.30 eV', synthesisMethod: 'inverse temperature crystallization',
    conditions: 'solution growth, 75 °C', efficiencyValue: '',
    evidence: 'hole mobility of 24 cm² V⁻¹ s⁻¹ … bandgap is 2.30 eV', confidence: 0.85,
  },
  {
    idx: 3, materialName: 'MAPbBr3', year: 2020,
    title: 'Bright green emission from MAPbBr3 quantum dots synthesized at room temperature',
    doi: '10.demo/mapbbr3.2020.003', venue: 'Journal of the American Chemical Society', authors: 'Protesescu, L.; Yakunin, S.; Bodnarchuk, M. I.; Kovalenko, M. V.',
    abstract: 'Room-temperature ligand-assisted reprecipitation produces 5 nm MAPbBr3 quantum dots with photoluminescence quantum yield of 87% at 525 nm (2.36 eV). The dots are integrated into green LEDs. No solar cell device results are reported.',
    citations: 1487,
    synthesized: 'yes', bandgapValue: '2.36 eV', synthesisMethod: 'ligand-assisted reprecipitation (LARP)',
    conditions: 'RT, ambient', efficiencyValue: '',
    evidence: 'PLQY of 87% at 525 nm (2.36 eV)', confidence: 0.87,
  },
  {
    idx: 4, materialName: 'MAPbBr3', year: 2021,
    title: 'Surface passivation of MAPbBr3 films with trioctylphosphine oxide for >10% wide-gap cells',
    doi: '10.demo/mapbbr3.2021.004', venue: 'ACS Energy Letters', authors: 'Yang, S.; Chen, B.; Hayden, M.; Zhu, K.',
    abstract: 'Trioctylphosphine oxide post-deposition treatment reduces surface trap density in MAPbBr3 films, raising the band-edge PL lifetime from 12 ns to 87 ns. Devices reach 10.4% PCE with a Voc of 1.61 V — a record for MAPbBr3 single junctions. Bandgap 2.30 eV.',
    citations: 256,
    synthesized: 'yes', bandgapValue: '2.30 eV', synthesisMethod: 'spin-coating with TOPO post-treatment',
    conditions: 'N2, 90 °C anneal', efficiencyValue: '10.4%',
    evidence: 'devices reach 10.4% PCE with a Voc of 1.61 V … bandgap 2.30 eV', confidence: 0.91,
  },
  {
    idx: 5, materialName: 'MAPbBr3', year: 2022,
    title: 'Hydrostatic pressure dependence of the MAPbBr3 bandgap: a high-pressure optical study',
    doi: '10.demo/mapbbr3.2022.005', venue: 'Physical Review B', authors: 'Jaffe, A.; Lin, Y.; Karunadasa, H. I.',
    abstract: 'Diamond-anvil-cell experiments show that the MAPbBr3 bandgap red-shifts from 2.30 eV at 0 GPa to 2.05 eV at 4.2 GPa before a phase transition to a non-perovskite structure. The work is purely optical/structural; no thin films or devices.',
    citations: 87,
    synthesized: 'no', bandgapValue: '2.30 eV (ambient) → 2.05 eV (4.2 GPa)', synthesisMethod: '',
    conditions: 'high pressure, RT', efficiencyValue: '',
    evidence: 'bandgap red-shifts from 2.30 eV at 0 GPa to 2.05 eV at 4.2 GPa', confidence: 0.78,
  },

  // ----- Cs2AgBiBr6 (5) -----
  {
    idx: 1, materialName: 'Cs2AgBiBr6', year: 2018,
    title: 'Cs2AgBiBr6 lead-free double perovskite: synthesis, optoelectronic properties and 1.5% solar cells',
    doi: '10.demo/cs2agbibr6.2018.001', venue: 'Nature Communications', authors: 'McClure, E. T.; Ball, M. R.; Windl, W.; Woodward, P. M.',
    abstract: 'We report the solution synthesis of Cs2AgBiBr6, a lead-free double perovskite. The material is air-stable for months and has an indirect bandgap of 1.95 eV (direct transition at 2.21 eV). First-generation solar cells deliver 1.5% PCE with a Voc of 1.01 V. Films are spin-coated from DMSO solution followed by 250 °C anneal.',
    citations: 1487,
    synthesized: 'yes', bandgapValue: '1.95 eV indirect / 2.21 eV direct', synthesisMethod: 'spin-coating from DMSO',
    conditions: 'air, 250 °C anneal 5 min', efficiencyValue: '1.5%',
    evidence: 'indirect bandgap of 1.95 eV … 1.5% PCE', confidence: 0.92,
  },
  {
    idx: 2, materialName: 'Cs2AgBiBr6', year: 2019,
    title: 'Improving Cs2AgBiBr6 photovoltaic efficiency to 2.5% via bismuth-rich surface termination',
    doi: '10.demo/cs2agbibr6.2019.002', venue: 'Joule', authors: 'Slavney, A. H.; Leppert, L.; Salmeron, M.; Neaton, B.; Karunadasa, H. I.',
    abstract: 'Bismuth-rich surface termination, achieved by tuning the Bi:Ag precursor ratio to 1.15:1, reduces surface recombination in Cs2AgBiBr6 films. Solar cell efficiency improves from 1.5% to 2.5%. Bandgap 2.21 eV (direct). PL lifetime increases from 4 ns to 46 ns.',
    citations: 612,
    synthesized: 'yes', bandgapValue: '2.21 eV (direct)', synthesisMethod: 'spin-coating with Bi-rich precursor',
    conditions: 'N2, 250 °C anneal', efficiencyValue: '2.5%',
    evidence: 'efficiency improves from 1.5% to 2.5% … bandgap 2.21 eV', confidence: 0.88,
  },
  {
    idx: 3, materialName: 'Cs2AgBiBr6', year: 2020,
    title: 'Hot-injection colloidal synthesis of Cs2AgBiBr6 nanocrystals for LED applications',
    doi: '10.demo/cs2agbibr6.2020.003', venue: 'ACS Nano', authors: 'Yang, B.; Chen, J.; Hong, F.; Mao, X.; Sun, Q.; Wei, Z.',
    abstract: 'Colloidal Cs2AgBiBr6 nanocrystals of 9 nm average diameter are synthesized by hot injection of Cs-oleate into a BiBr3/AgBr/oleylamine/oleic acid solution at 200 °C. The nanocrystals show broadband photoluminescence centered at 580 nm (2.14 eV) with PLQY 3.2%. LED EQE 0.13%. No photovoltaic device results.',
    citations: 432,
    synthesized: 'yes', bandgapValue: '2.14 eV', synthesisMethod: 'hot-injection colloidal synthesis',
    conditions: 'N2, 200 °C', efficiencyValue: '',
    evidence: 'PLQY 3.2% … centered at 580 nm (2.14 eV)', confidence: 0.83,
  },
  {
    idx: 4, materialName: 'Cs2AgBiBr6', year: 2021,
    title: 'Defect tolerance and carrier dynamics in Cs2AgBiBr6 from pump-probe spectroscopy',
    doi: '10.demo/cs2agbibr6.2021.004', venue: 'Nature Communications', authors: 'Wright, A. D.; Verdi, C.; Milot, R. L.; Herz, L. M.',
    abstract: 'Transient absorption spectroscopy on Cs2AgBiBr6 thin films measures a direct bandgap of 2.21 eV and an indirect gap of 1.95 eV. Charge-carrier mobility is 2.0 cm² V⁻¹ s⁻¹ and bimolecular recombination coefficient is 1.1 × 10⁻¹⁰ cm³ s⁻¹. The films studied are fabricated by the same method as McClure et al., ref. 2018.',
    citations: 298,
    synthesized: 'yes', bandgapValue: '2.21 eV direct / 1.95 eV indirect', synthesisMethod: 'spin-coating from DMSO (ref)',
    conditions: 'N2, RT optical', efficiencyValue: '',
    evidence: 'direct bandgap of 2.21 eV … mobility is 2.0 cm² V⁻¹ s⁻¹', confidence: 0.84,
  },
  {
    idx: 5, materialName: 'Cs2AgBiBr6', year: 2022,
    title: 'High-throughput DFT search for lead-free double perovskites beyond Cs2AgBiBr6',
    doi: '10.demo/cs2agbibr6.2022.005', venue: 'npj Computational Materials', authors: 'Pitta, A.; Filip, M. R.; Giustino, F.',
    abstract: 'DFT screening of 96 A2BB′X6 double-perovskite compositions identifies 14 candidates with predicted direct bandgaps in the 1.2–2.0 eV range suitable for PV. Cs2AgBiBr6 is included as a reference; its computed bandgap is 2.18 eV (HSE06). Computational study only — no experiments.',
    citations: 156,
    synthesized: 'no', bandgapValue: '2.18 eV (HSE06)', synthesisMethod: '',
    conditions: 'DFT, 0 K', efficiencyValue: '',
    evidence: 'computed bandgap is 2.18 eV (HSE06) … 14 candidates', confidence: 0.81,
  },

  // ----- Cu2ZnSnSe4 / CZTSe (5) -----
  {
    idx: 1, materialName: 'Cu2ZnSnSe4', year: 2018,
    title: 'Cu2ZnSnSe4 solar cells with 12.6% efficiency via sputtering and low-temperature selenization',
    doi: '10.demo/cu2znsnse4.2018.001', venue: 'Progress in Photovoltaics', authors: 'Yan, C.; Huang, J.; Sun, K.; Johnston, S.; Sun, H.; Liu, X.',
    abstract: 'A 12.6% efficient Cu2ZnSnSe4 solar cell is achieved by sputtering a Cu-Zn-Sn metallic precursor followed by selenization at 500 °C under Se vapor. Bandgap 1.04 eV. Voc 466 mV, Jsc 36.4 mA/cm². Secondary Cu2SnSe3 phase is detected by Raman but does not appear to limit performance.',
    citations: 689,
    synthesized: 'yes', bandgapValue: '1.04 eV', synthesisMethod: 'sputtering + selenization',
    conditions: 'Se vapor, 500 °C, 30 min', efficiencyValue: '12.6%',
    evidence: '12.6% efficient Cu2ZnSnSe4 … bandgap 1.04 eV', confidence: 0.91,
  },
  {
    idx: 2, materialName: 'Cu2ZnSnSe4', year: 2020,
    title: 'Defect engineering in CZTSe: suppressing Cu_Zn antisite formation via off-stoichiometric growth',
    doi: '10.demo/cu2znsnse4.2020.002', venue: 'Advanced Energy Materials', authors: 'Suh, B. L.; Kim, S.; Lee, S.; Hwang, T.; Kim, S.; Jang, J.',
    abstract: 'A Cu-poor/Zn-rich (Cu/(Zn+Sn) = 0.85, Zn/Sn = 1.15) growth regime reduces the Cu_Zn antisite density in Cu2ZnSnSe4 by 3× as measured by admittance spectroscopy. Champion PCE reaches 11.8% with Voc of 458 mV. Bandgap 1.04 eV. Films are grown by co-evaporation.',
    citations: 342,
    synthesized: 'yes', bandgapValue: '1.04 eV', synthesisMethod: 'co-evaporation',
    conditions: 'vacuum, 500 °C substrate', efficiencyValue: '11.8%',
    evidence: 'Cu_Zn antisite density … by 3× … 11.8%', confidence: 0.86,
  },
  {
    idx: 3, materialName: 'Cu2ZnSnSe4', year: 2019,
    title: 'Cation substitution and kesterite-to-stannite phase control in Cu2ZnSnSe4',
    doi: '10.demo/cu2znsnse4.2019.003', venue: 'Chemistry of Materials', authors: 'Ford, G. M.; Guo, Q.; Agrawal, R.; Hillhouse, H. W.',
    abstract: 'Solution-processed Cu2ZnSnSe4 with controlled Cu/(Zn+Sn) ratios is studied by synchrotron XRD. The kesterite phase dominates for Cu-poor compositions; a stannite impurity appears for stoichiometric films. Bandgap is 1.04 eV and is largely insensitive to phase fraction. No device results are reported.',
    citations: 198,
    synthesized: 'yes', bandgapValue: '1.04 eV', synthesisMethod: 'solution processing (hydrazine)',
    conditions: 'hydrazine, 500 °C anneal', efficiencyValue: '',
    evidence: 'kesterite phase dominates … bandgap is 1.04 eV', confidence: 0.82,
  },
  {
    idx: 4, materialName: 'Cu2ZnSnSe4', year: 2021,
    title: 'Ag substitution in Cu2ZnSnSe4: pushing kesterite efficiency past 13%',
    doi: '10.demo/cu2znsnse4.2021.004', venue: 'Nature Energy', authors: 'Gershon, T.; Gokmen, T.; Gunawan, O.; Haight, R.; Guha, S.; Shin, B.',
    abstract: 'Substituting 10% of Cu with Ag (Cu1.8Ag0.2ZnSnSe4) suppresses Cu_Zn disorder and widens the bandgap from 1.04 eV to 1.06 eV. Champion device efficiency reaches 13.2% certified — a new kesterite record. Films are grown by co-evaporation.',
    citations: 524,
    synthesized: 'yes', bandgapValue: '1.06 eV', synthesisMethod: 'co-evaporation with Ag substitution',
    conditions: 'vacuum, 500 °C substrate', efficiencyValue: '13.2%',
    evidence: '13.2% certified … bandgap from 1.04 eV to 1.06 eV', confidence: 0.93,
  },
  {
    idx: 5, materialName: 'Cu2ZnSnSe4', year: 2022,
    title: 'Anharmonic phonon transport and lattice thermal conductivity of kesterite Cu2ZnSnSe4',
    doi: '10.demo/cu2znsnse4.2022.005', venue: 'Physical Review Materials', authors: 'Gupta, M. K.; Singh, S.; Mittal, R.',
    abstract: 'Inelastic neutron scattering and DFT calculations determine a lattice thermal conductivity of 4.2 W m⁻¹ K⁻¹ at 300 K for Cu2ZnSnSe4, in good agreement with measurement. The bandgap is computed as 1.08 eV (HSE06). Computational only.',
    citations: 78,
    synthesized: 'no', bandgapValue: '1.08 eV (HSE06)', synthesisMethod: '',
    conditions: 'DFT + INS, 300 K', efficiencyValue: '',
    evidence: 'lattice thermal conductivity of 4.2 W m⁻¹ K⁻¹ … bandgap is computed as 1.08 eV', confidence: 0.77,
  },

  // ----- Sb2Se3 (5) -----
  {
    idx: 1, materialName: 'Sb2Se3', year: 2020,
    title: 'Sb2Se3 thin-film solar cells with 9.2% efficiency via close-space sublimation and substrate texture',
    doi: '10.demo/sb2se3.2020.001', venue: 'Nature Energy', authors: 'Wen, X.; He, Y.; Chen, C.; Liu, X.; Wang, L.; Yang, B.; Tang, J.',
    abstract: 'A 9.2% efficient antimony selenide (Sb2Se3) solar cell is achieved by close-space sublimation onto a CdS/TiO2 substrate textured along the [221] preferred orientation. Bandgap 1.17 eV. Voc 395 mV, Jsc 31.7 mA/cm². (Sb,S) alloying is observed at the CdS interface but is limited to <5 nm.',
    citations: 712,
    synthesized: 'yes', bandgapValue: '1.17 eV', synthesisMethod: 'close-space sublimation (CSS)',
    conditions: 'vacuum, 350 °C substrate', efficiencyValue: '9.2%',
    evidence: '9.2% efficient antimony selenide … bandgap 1.17 eV', confidence: 0.91,
  },
  {
    idx: 2, materialName: 'Sb2Se3', year: 2021,
    title: 'Rapid thermal evaporation of Sb2Se3: kinetics, orientation control and 7.5% devices',
    doi: '10.demo/sb2se3.2021.002', venue: 'Solar RRL', authors: 'Li, Z.; Liang, X.; Lin, G.; Zhu, W.; Chen, C.; Tang, J.',
    abstract: 'Rapid thermal evaporation (RTE) of Sb2Se3 in a single-source vacuum system yields films with strong [221] preferred orientation when substrate temperature is held at 300 °C. Bandgap 1.17 eV. Champion device efficiency reaches 7.5%.',
    citations: 248,
    synthesized: 'yes', bandgapValue: '1.17 eV', synthesisMethod: 'rapid thermal evaporation',
    conditions: 'vacuum, 300 °C substrate', efficiencyValue: '7.5%',
    evidence: 'champion device efficiency reaches 7.5% … bandgap 1.17 eV', confidence: 0.85,
  },
  {
    idx: 3, materialName: 'Sb2Se3', year: 2019,
    title: 'Solution-processed Sb2Se3 from single-source thiol-amine precursor for printable photovoltaics',
    doi: '10.demo/sb2se3.2019.003', venue: 'Journal of Materials Chemistry A', authors: 'Liu, X.; Chen, Y.; Zhang, H.; Tang, J.',
    abstract: 'A single-source thiol-amine precursor (Sb2O3 dissolved in ethanedithiol/ethanolamine) is spin-coated and annealed at 350 °C to yield Sb2Se3 films. Bandgap 1.18 eV. Champion efficiency 5.3% with CdS buffer layer. The paper demonstrates a route to printable Sb2Se3 with stability >1000 h ambient storage.',
    citations: 312,
    synthesized: 'yes', bandgapValue: '1.18 eV', synthesisMethod: 'solution processing (thiol-amine)',
    conditions: 'air anneal, 350 °C', efficiencyValue: '5.3%',
    evidence: 'bandgap 1.18 eV … champion efficiency 5.3%', confidence: 0.83,
  },
  {
    idx: 4, materialName: 'Sb2Se3', year: 2022,
    title: 'Quasi-1D band structure of Sb2Se3 from angle-resolved photoemission',
    doi: '10.demo/sb2se3.2022.004', venue: 'Physical Review B', authors: 'Mantsevich, V. N.; Klinovaja, J.; Loss, D.',
    abstract: 'Angle-resolved photoemission spectroscopy (ARPES) on Sb2Se3 single crystals confirms a quasi-1D valence band with effective mass anisotropy of ~5 along [010] vs [001]. The optical bandgap is measured as 1.17 eV. No device results — fundamental electronic structure study.',
    citations: 84,
    synthesized: 'uncertain', bandgapValue: '1.17 eV', synthesisMethod: 'single crystal growth (Bridgman)',
    conditions: 'Bridgman, RT ARPES', efficiencyValue: '',
    evidence: 'effective mass anisotropy of ~5 … bandgap is measured as 1.17 eV', confidence: 0.78,
  },
  {
    idx: 5, materialName: 'Sb2Se3', year: 2023,
    title: 'Band alignment engineering at the Sb2Se3/CdS interface using ZnSe intermediate layers',
    doi: '10.demo/sb2se3.2023.005', venue: 'Solar Energy Materials and Solar Cells', authors: 'Li, J.; Chen, B.; Tang, J.; Zhu, L.',
    abstract: 'Inserting a 5 nm ZnSe interlayer between CdS and Sb2Se3 reduces the conduction-band cliff from −0.35 eV to −0.12 eV. Champion device efficiency improves from 7.5% to 8.3%. Bandgap 1.17 eV. Films are deposited by close-space sublimation.',
    citations: 67,
    synthesized: 'yes', bandgapValue: '1.17 eV', synthesisMethod: 'CSS + sputtered ZnSe interlayer',
    conditions: 'vacuum, 350 °C substrate', efficiencyValue: '8.3%',
    evidence: 'champion device efficiency improves from 7.5% to 8.3% … bandgap 1.17 eV', confidence: 0.84,
  },

  // ----- BiFeO3 (5) -----
  {
    idx: 1, materialName: 'BiFeO3', year: 2019,
    title: 'Ferroelectric BiFeO3 thin-film solar cells: bulk photovoltaic effect and 0.5% efficiency',
    doi: '10.demo/bifeo3.2019.001', venue: 'Advanced Materials', authors: 'Basu, S. R.; Martin, L. W.; Chu, Y. H.; Ramesh, R.',
    abstract: 'Epitaxial BiFeO3 thin films grown by pulsed laser deposition on SrTiO3 show a bulk photovoltaic effect with above-bandgap Voc of 0.85 V. Bandgap 2.74 eV. Champion device efficiency is 0.5%. Domain wall contributions to the photocurrent are quantified.',
    citations: 534,
    synthesized: 'yes', bandgapValue: '2.74 eV', synthesisMethod: 'pulsed laser deposition (PLD)',
    conditions: 'PLD, 700 °C, O2', efficiencyValue: '0.5%',
    evidence: 'above-bandgap Voc of 0.85 V … efficiency is 0.5%', confidence: 0.86,
  },
  {
    idx: 2, materialName: 'BiFeO3', year: 2020,
    title: 'Sol-gel BiFeO3 ceramics: oxygen-vacancy control and visible-light photocatalysis',
    doi: '10.demo/bifeo3.2020.002', venue: 'Journal of the American Ceramic Society', authors: 'Park, T.-J.; Papaefthymiou, G. C.; Moodenbaugh, A. R.; Wong, S. S.',
    abstract: 'Sol-gel-derived BiFeO3 ceramics with controlled oxygen-vacancy concentration show bandgap narrowing from 2.74 eV to 2.50 eV with 5% Fe3+/Fe2+ reduction. Photocatalytic degradation of Rhodamine B reaches 92% under visible light in 90 min. No PV device is reported.',
    citations: 287,
    synthesized: 'yes', bandgapValue: '2.50–2.74 eV', synthesisMethod: 'sol-gel',
    conditions: 'air anneal, 600 °C', efficiencyValue: '',
    evidence: 'bandgap narrowing from 2.74 eV to 2.50 eV', confidence: 0.79,
  },
  {
    idx: 3, materialName: 'BiFeO3', year: 2021,
    title: 'Domain-wall photovoltaic effect in BiFeO3 single crystals',
    doi: '10.demo/bifeo3.2021.003', venue: 'Nature Materials', authors: 'Seidel, J.; Fu, D.; Yang, S.-Y.; Ramesh, R.',
    abstract: 'Photoconductive atomic force microscopy on BiFeO3 single crystals reveals photocurrent enhancement of 50× at 71° and 109° domain walls. Bandgap 2.74 eV. Domain-wall density engineering yields open-circuit voltages up to 16 V in unpoled crystals. No thin-film PV device is reported.',
    citations: 421,
    synthesized: 'yes', bandgapValue: '2.74 eV', synthesisMethod: 'flux growth',
    conditions: 'flux, 750 °C', efficiencyValue: '',
    evidence: 'photocurrent enhancement of 50× … open-circuit voltages up to 16 V', confidence: 0.83,
  },
  {
    idx: 4, materialName: 'BiFeO3', year: 2018,
    title: 'Hybrid DFT study of polaron-mediated conduction in multiferroic BiFeO3',
    doi: '10.demo/bifeo3.2018.004', venue: 'Physical Review B', authors: 'Ji, W.; Yao, K.; Liang, Y. C.',
    abstract: 'Hybrid DFT (HSE06) calculations identify small oxygen-vacancy polarons as the dominant conduction mechanism in BiFeO3. Computed bandgap is 2.69 eV, in good agreement with experiment (2.74 eV). The paper presents no experimental synthesis or device results.',
    citations: 156,
    synthesized: 'no', bandgapValue: '2.69 eV (HSE06)', synthesisMethod: '',
    conditions: 'DFT, 0 K', efficiencyValue: '',
    evidence: 'computed bandgap is 2.69 eV … polaron-mediated conduction', confidence: 0.76,
  },
  {
    idx: 5, materialName: 'BiFeO3', year: 2022,
    title: 'Bandgap engineering of BiFeO3 via La substitution for ferroelectric photovoltaics',
    doi: '10.demo/bifeo3.2022.005', venue: 'Applied Physics Letters', authors: 'Nechache, R.; Harnagea, C.; Pignolet, A.; Rosei, F.',
    abstract: 'La-substituted Bi1−xLaxFeO3 (x = 0–0.20) thin films grown by PLD show a tunable bandgap from 2.74 eV (x=0) to 2.60 eV (x=0.20). Champion x=0.10 device efficiency reaches 0.83%, an improvement over undoped BiFeO3 (0.5%).',
    citations: 198,
    synthesized: 'yes', bandgapValue: '2.60–2.74 eV', synthesisMethod: 'pulsed laser deposition',
    conditions: 'PLD, 700 °C, O2', efficiencyValue: '0.83%',
    evidence: 'tunable bandgap from 2.74 eV (x=0) to 2.60 eV (x=0.20) … 0.83%', confidence: 0.81,
  },

  // ----- TiO2 (5) -----
  {
    idx: 1, materialName: 'TiO2', year: 2018,
    title: 'Anatase TiO2 photoanodes for dye-sensitized solar cells: effect of {001} facet exposure',
    doi: '10.demo/tio2.2018.001', venue: 'ACS Applied Materials & Interfaces', authors: 'Roy, P.; Berger, S.; Schmuki, P.',
    abstract: 'Hydrothermally grown anatase TiO2 nanosheets with 70% {001} facet exposure show a 35% improvement in DSSC photocurrent over {101}-dominated nanoparticles. Bandgap 3.20 eV. Champion DSSC efficiency is 8.1% (vs 6.0% for nanoparticles). Dye: N719.',
    citations: 612,
    synthesized: 'yes', bandgapValue: '3.20 eV', synthesisMethod: 'hydrothermal synthesis',
    conditions: 'autoclave, 180 °C, 24 h', efficiencyValue: '8.1%',
    evidence: '35% improvement in DSSC photocurrent … bandgap 3.20 eV', confidence: 0.87,
  },
  {
    idx: 2, materialName: 'TiO2', year: 2020,
    title: 'Atomic-layer-deposited TiO2 electron transport layers for >22% perovskite solar cells',
    doi: '10.demo/tio2.2020.002', venue: 'Advanced Functional Materials', authors: 'Wojciechowski, K.; Stranks, S. D.; Abate, A.; Sadoughi, G.; Snaith, H. J.',
    abstract: 'ALD-grown compact TiO2 layers (40 nm, anatase) replace spray-pyrolysed TiO2 in perovskite solar cell stacks, raising the champion efficiency from 19.5% to 22.1%. The TiO2 itself has bandgap 3.20 eV and acts only as electron transport; no standalone TiO2 PV device is reported.',
    citations: 487,
    synthesized: 'yes', bandgapValue: '3.20 eV', synthesisMethod: 'atomic layer deposition (ALD)',
    conditions: 'ALD, 200 °C', efficiencyValue: '',
    evidence: 'champion efficiency from 19.5% to 22.1% … bandgap 3.20 eV', confidence: 0.82,
  },
  {
    idx: 3, materialName: 'TiO2', year: 2019,
    title: 'Hydrogenated TiO2 (black titania): bandgap narrowing and photocatalytic hydrogen evolution',
    doi: '10.demo/tio2.2019.003', venue: 'Energy & Environmental Science', authors: 'Chen, X.; Liu, L.; Huang, F.; Marcus, M.',
    abstract: 'High-pressure hydrogenation of anatase TiO2 nanocrystals produces "black titania" with an optical bandgap narrowed from 3.20 eV to 2.40 eV. The material drives photocatalytic H2 evolution at 10 mmol g⁻¹ h⁻¹ under AM 1.5. No solar cell device reported.',
    citations: 1287,
    synthesized: 'yes', bandgapValue: '2.40–3.20 eV', synthesisMethod: 'hydrogenation of anatase',
    conditions: 'H2 atmosphere, 500 °C, 5 days', efficiencyValue: '',
    evidence: 'optical bandgap narrowed from 3.20 eV to 2.40 eV … H2 evolution', confidence: 0.85,
  },
  {
    idx: 4, materialName: 'TiO2', year: 2021,
    title: 'Comparative DFT study of anatase, rutile and brookite TiO2 polymorphs for photoanode applications',
    doi: '10.demo/tio2.2021.004', venue: 'Computational Materials Science', authors: 'Lü, X.; Yang, W.; Quan, Z.; Lin, T.',
    abstract: 'PBE0 hybrid-DFT calculations of anatase, rutile and brookite TiO2 give bandgaps of 3.20, 3.03 and 2.90 eV respectively, in good agreement with experiment. Carrier effective masses and surface energies are reported for all three polymorphs. Computational only — no synthesis.',
    citations: 134,
    synthesized: 'no', bandgapValue: '3.20 eV anatase / 3.03 eV rutile / 2.90 eV brookite', synthesisMethod: '',
    conditions: 'DFT, 0 K', efficiencyValue: '',
    evidence: 'bandgaps of 3.20, 3.03 and 2.90 eV respectively', confidence: 0.81,
  },
  {
    idx: 5, materialName: 'TiO2', year: 2022,
    title: 'Mesoporous TiO2 scaffold optimization for >25% efficient perovskite solar cells',
    doi: '10.demo/tio2.2022.005', venue: 'Solar Energy', authors: 'Bi, D.; Tress, W.; Hagfeldt, A.; Boschloo, G.',
    abstract: 'A 150 nm mesoporous TiO2 layer (20 nm anatase particles, bandgap 3.20 eV) on top of a 40 nm compact TiO2 layer provides the optimal scaffold for state-of-the-art perovskite solar cells. Champion device PCE is 25.3% (uncertified). The TiO2 itself is not photoactive under AM 1.5.',
    citations: 218,
    synthesized: 'yes', bandgapValue: '3.20 eV', synthesisMethod: 'spin-coating of TiO2 paste + sintering',
    conditions: 'sinter, 500 °C, 30 min', efficiencyValue: '',
    evidence: 'champion device PCE is 25.3% … bandgap 3.20 eV', confidence: 0.83,
  },

  // ----- MASnI3 (5) -----
  {
    idx: 1, materialName: 'MASnI3', year: 2019,
    title: 'Lead-free MASnI3 perovskite solar cells with 5.7% efficiency via SnF2 additive',
    doi: '10.demo/masni3.2019.001', venue: 'Energy & Environmental Science', authors: 'Liao, W.; Zhao, D.; Yu, Y.; Grice, C. R.; Wang, C.; Yan, Y.',
    abstract: 'Methylammonium tin triiodide (MASnI3) solar cells with 10 mol% SnF2 additive deliver a champion efficiency of 5.7% with a Voc of 0.51 V. SnF2 suppresses Sn²⁺/Sn⁴⁺ oxidation during film deposition. Bandgap 1.30 eV. Devices are processed in N2 and degrade within 4 h in ambient air.',
    citations: 712,
    synthesized: 'yes', bandgapValue: '1.30 eV', synthesisMethod: 'spin-coating with SnF2 additive',
    conditions: 'N2 glovebox, 100 °C anneal', efficiencyValue: '5.7%',
    evidence: 'champion efficiency of 5.7% … bandgap 1.30 eV', confidence: 0.89,
  },
  {
    idx: 2, materialName: 'MASnI3', year: 2020,
    title: 'Reducing Sn⁴⁺ in MASnI3 via hypophosphorous acid for improved photostability',
    doi: '10.demo/masni3.2020.002', venue: 'Advanced Materials', authors: 'Jokar, E.; Chien, C.-H.; Tsai, C.-M.; Diau, E. W.-G.',
    abstract: 'Addition of 8 mol% hypophosphorous acid (HPB) to MASnI3 precursor reduces initial Sn⁴⁺ fraction from 12% to 3% as measured by XPS. Champion device efficiency improves from 4.1% to 6.3%. Bandgap 1.30 eV. Devices retain 80% PCE after 100 h AM 1.5 illumination in N2.',
    citations: 423,
    synthesized: 'yes', bandgapValue: '1.30 eV', synthesisMethod: 'spin-coating with HPB additive',
    conditions: 'N2, 100 °C anneal', efficiencyValue: '6.3%',
    evidence: 'champion device efficiency improves from 4.1% to 6.3% … bandgap 1.30 eV', confidence: 0.87,
  },
  {
    idx: 3, materialName: 'MASnI3', year: 2021,
    title: 'Vapour-phase deposition of MASnI3 thin films: phase control and oxidation resistance',
    doi: '10.demo/masni3.2021.003', venue: 'Journal of Materials Chemistry A', authors: 'Shao, S.; Loi, M. A.; Dudko, V.',
    abstract: 'Low-pressure chemical vapour deposition of MASnI3 yields films with 50% reduction in Sn⁴⁺ fraction compared to solution processing. Bandgap 1.30 eV. Champion device efficiency 4.8% with notably improved reproducibility (std-dev < 0.3% absolute).',
    citations: 198,
    synthesized: 'yes', bandgapValue: '1.30 eV', synthesisMethod: 'low-pressure chemical vapour deposition',
    conditions: 'vacuum, 120 °C substrate', efficiencyValue: '4.8%',
    evidence: '50% reduction in Sn⁴⁺ fraction … 4.8%', confidence: 0.83,
  },
  {
    idx: 4, materialName: 'MASnI3', year: 2018,
    title: 'First-principles study of intrinsic defects in methylammonium tin iodide',
    doi: '10.demo/masni3.2018.004', venue: 'Chemistry of Materials', authors: 'Xu, P.; Sun, L.; Xiang, H. J.; Gong, X. G.',
    abstract: 'Hybrid DFT calculations identify the Sn_I antisite as the dominant deep defect in MASnI3, in contrast to defect-tolerant MAPbI3. Computed bandgap 1.30 eV (PBE+SOC), 1.36 eV (HSE06+SOC). The paper presents computational results only.',
    citations: 287,
    synthesized: 'no', bandgapValue: '1.30 eV (PBE+SOC)', synthesisMethod: '',
    conditions: 'DFT, 0 K', efficiencyValue: '',
    evidence: 'computed bandgap 1.30 eV (PBE+SOC) … Sn_I antisite', confidence: 0.82,
  },
  {
    idx: 5, materialName: 'MASnI3', year: 2022,
    title: 'In situ absorption spectroscopy of MASnI3 degradation kinetics under controlled O2 and H2O',
    doi: '10.demo/masni3.2022.005', venue: 'Journal of Physical Chemistry Letters', authors: 'Konstantakou, M.; Stergiopoulos, T.',
    abstract: 'Time-resolved UV-vis shows that MASnI3 thin films lose 50% of their band-edge absorbance within 6 min under 20% RH ambient air, but only 5% loss under dry O2. Bandgap is 1.30 eV initially, shifting to 1.45 eV after 30 min degradation. No device results — fundamental stability study.',
    citations: 96,
    synthesized: 'yes', bandgapValue: '1.30 eV (fresh) → 1.45 eV (degraded)', synthesisMethod: 'spin-coating (ref method)',
    conditions: 'controlled atmosphere, RT', efficiencyValue: '',
    evidence: 'bandgap is 1.30 eV … 50% of their band-edge absorbance within 6 min', confidence: 0.74,
  },
]

// 10 realistic efficiency records. NREL/Emerging PV numbers for champion
// cells; literature values for less-established materials. Years reflect
// when each record was widely certified/quoted, not necessarily the
// latest progress — this is "demo" not "current champion tracker".
interface DemoEfficiency {
  materialName: string
  efficiencyValue: number
  certified: boolean
  source: string
  sourceType: string
  testConditions: string
  doi: string
  year: number
  notes: string
}

const DEMO_EFFICIENCIES: DemoEfficiency[] = [
  { materialName: 'MAPbI3', efficiencyValue: 25.7, certified: true, source: 'NREL Best Research-Cell Efficiency Chart', sourceType: 'database', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/eff.mapbi3.25.7', year: 2020, notes: 'NREL-certified MAPbI3-derived triple-cation cell' },
  { materialName: 'FAPbI3', efficiencyValue: 24.2, certified: true, source: 'NREL Best Research-Cell Efficiency Chart', sourceType: 'database', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/eff.fapbi3.24.2', year: 2021, notes: 'α-FAPbI3 with 2D capping layer (Min et al., Nature 2021)' },
  { materialName: 'CsPbI3', efficiencyValue: 20.4, certified: true, source: 'NREL Best Research-Cell Efficiency Chart', sourceType: 'database', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/eff.cspbi3.20.4', year: 2021, notes: 'All-inorganic γ-CsPbI3 with HPB additive' },
  { materialName: 'MAPbBr3', efficiencyValue: 10.4, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/mapbbr3.2021.004', year: 2021, notes: 'Wide-gap single-junction champion with TOPO passivation' },
  { materialName: 'Cs2AgBiBr6', efficiencyValue: 2.5, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/cs2agbibr6.2019.002', year: 2019, notes: 'Lead-free double perovskite, Bi-rich surface termination' },
  { materialName: 'Cu2ZnSnSe4', efficiencyValue: 13.2, certified: true, source: 'NREL Best Research-Cell Efficiency Chart', sourceType: 'database', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/eff.cu2znsnse4.13.2', year: 2021, notes: 'Ag-substituted kesterite record' },
  { materialName: 'Sb2Se3', efficiencyValue: 9.2, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/sb2se3.2020.001', year: 2020, notes: 'CSS-deposited Sb2Se3 with [221] texture' },
  { materialName: 'BiFeO3', efficiencyValue: 0.83, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/bifeo3.2022.005', year: 2022, notes: 'La-substituted BFO; bulk photovoltaic effect' },
  { materialName: 'TiO2', efficiencyValue: 8.1, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C, N719 dye', doi: '10.demo/tio2.2018.001', year: 2018, notes: 'DSSC photoanode with {001}-dominant anatase nanosheets' },
  { materialName: 'MASnI3', efficiencyValue: 6.3, certified: false, source: 'literature', sourceType: 'literature', testConditions: 'AM 1.5G, 100 mW/cm², 25 °C', doi: '10.demo/masni3.2020.002', year: 2020, notes: 'Lead-free Sn perovskite with HPB additive' },
]

// 5 demo verifications — 4 verified + 1 flagged.
interface DemoVerification {
  materialName: string
  status: 'verified' | 'flagged'
  reviewer: string
  notes: string
  checkedFields: string
}

const DEMO_VERIFICATIONS: DemoVerification[] = [
  { materialName: 'MAPbI3', status: 'verified', reviewer: 'demo-curator', notes: 'NREL-certified value 25.7% cross-checked against NREL chart (Mar 2020). DOIs and bandgap consistent across 3 of 5 papers.', checkedFields: 'bandgap;method;efficiency' },
  { materialName: 'FAPbI3', status: 'verified', reviewer: 'demo-curator', notes: 'Min et al. 2021 DOI resolves correctly; certified efficiency 24.2% matches Nature paper abstract.', checkedFields: 'efficiency;bandgap' },
  { materialName: 'CsPbI3', status: 'verified', reviewer: 'demo-curator', notes: 'Wang et al. 2021 verified against NREL. Phase purity claims consistent across XRD/PL data.', checkedFields: 'bandgap;method;efficiency' },
  { materialName: 'Cu2ZnSnSe4', status: 'verified', reviewer: 'demo-curator', notes: 'Ag-substituted kesterite 13.2% (Gershon 2021) cross-checked. Note: paper claims 10% Ag substitution — stoichiometry verified by EDS in original work.', checkedFields: 'efficiency;method' },
  { materialName: 'BiFeO3', status: 'flagged', reviewer: 'demo-curator', notes: 'Reported 0.83% efficiency appears plausible but the BiFeO3/Bi1−xLaxFeO3 stoichiometry in the abstract (x=0.10) is inconsistent with the experimental section (x=0.20). Needs manual re-read before relying on this record.', checkedFields: 'efficiency' },
]

export async function POST(req: NextRequest) {
  // --- Rate limit (very expensive — bulk DB writes — 5/min per IP) -------
  const ip = getIdentifier(req)
  const rl = rateLimit(`demo-seed:${ip}`, RATE_LIMITS.batch)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    )
  }

  try {
    // --- 1. Ensure the 60 base materials exist (no-op if already seeded) ---
    const existingMaterials = await db.material.count()
    if (existingMaterials < 10) {
      await seedMaterialsIfEmpty()
    }

    // --- 2. Resolve the 10 key materials by name → grab their real IDs ---
    const keyMaterialNames = Array.from(new Set(DEMO_PAPERS.map(p => p.materialName)))
    const materials = await db.material.findMany({
      where: { name: { in: keyMaterialNames } },
    })
    const materialIdByName = new Map(materials.map(m => [m.name, m.id]))
    const missing = keyMaterialNames.filter(n => !materialIdByName.has(n))
    if (missing.length > 0) {
      return apiError(`Missing base materials after seed: ${missing.join(', ')}`)
    }

    // --- 3-5. Papers + Classifications + Efficiencies + Verifications ---
    // R6: wrap the entire multi-step creation in a single transaction so a
    // failure halfway through (e.g. a constraint violation on one row)
    // rolls back ALL prior inserts. Without this, a mid-loop error would
    // leave the DB with partial demo data that the idempotent upserts
    // wouldn't cleanly overwrite on retry (different `idx` values, etc.).
    //
    // `seedMaterialsIfEmpty` (step 1) is intentionally OUTSIDE the
    // transaction — it's its own idempotent setup that we don't want to
    // roll back if the demo data write fails. The material resolution
    // (step 2) is also outside — it's a read.
    const { papersCreated, classificationsCreated, efficienciesCreated, verificationsCreated } = await db.$transaction(async (tx) => {
      let pc = 0
      let cc = 0
      // --- 3. Papers + Classifications (idempotent via stable demo-* ids) ---
      for (const demo of DEMO_PAPERS) {
        const materialId = materialIdByName.get(demo.materialName)!
        const slug = slugFor(demo.materialName)
        const paperId = `demo-${slug}-${demo.idx}`

        // Determine classification status: synthesized=yes ⇒ 'extracted'
        const classificationStatus = demo.synthesized === 'yes' ? 'extracted' : 'classified'

        await tx.paper.upsert({
          where: { id: paperId },
          create: {
            id: paperId,
            materialId,
            title: demo.title,
            year: demo.year,
            doi: demo.doi,
            abstract: demo.abstract,
            authors: demo.authors,
            venue: demo.venue,
            url: `https://doi.org/${demo.doi}`,
            source: 'manual',
            citationCount: demo.citations,
            oaStatus: 'closed',
          },
          update: {
            materialId,
            title: demo.title,
            year: demo.year,
            doi: demo.doi,
            abstract: demo.abstract,
            authors: demo.authors,
            venue: demo.venue,
            url: `https://doi.org/${demo.doi}`,
            citationCount: demo.citations,
          },
        })
        pc++

        await tx.classification.upsert({
          where: { paperId },
          create: {
            id: `demo-class-${slug}-${demo.idx}`,
            paperId,
            materialId,
            synthesized: demo.synthesized,
            hasBandgap: !!demo.bandgapValue,
            hasMethod: !!demo.synthesisMethod,
            hasEfficiency: !!demo.efficiencyValue,
            hasPhaseDiagram: false,
            bandgapValue: demo.bandgapValue,
            synthesisMethod: demo.synthesisMethod,
            conditions: demo.conditions,
            efficiencyValue: demo.efficiencyValue,
            evidence: demo.evidence,
            confidence: demo.confidence,
            status: classificationStatus,
            model: 'demo-seed',
          },
          update: {
            materialId,
            synthesized: demo.synthesized,
            hasBandgap: !!demo.bandgapValue,
            hasMethod: !!demo.synthesisMethod,
            hasEfficiency: !!demo.efficiencyValue,
            hasPhaseDiagram: false,
            bandgapValue: demo.bandgapValue,
            synthesisMethod: demo.synthesisMethod,
            conditions: demo.conditions,
            efficiencyValue: demo.efficiencyValue,
            evidence: demo.evidence,
            confidence: demo.confidence,
            status: classificationStatus,
            model: 'demo-seed',
          },
        })
        cc++
      }

      // --- 4. Efficiencies (idempotent via stable demo-eff-* ids) ---
      let ec = 0
      for (const eff of DEMO_EFFICIENCIES) {
        const materialId = materialIdByName.get(eff.materialName)
        if (!materialId) continue
        const slug = slugFor(eff.materialName)
        const effId = `demo-eff-${slug}`
        await tx.efficiency.upsert({
          where: { id: effId },
          create: {
            id: effId,
            materialId,
            efficiencyValue: eff.efficiencyValue,
            certified: eff.certified,
            source: eff.source,
            sourceType: eff.sourceType,
            testConditions: eff.testConditions,
            doi: eff.doi,
            year: eff.year,
            notes: eff.notes,
          },
          update: {
            materialId,
            efficiencyValue: eff.efficiencyValue,
            certified: eff.certified,
            source: eff.source,
            sourceType: eff.sourceType,
            testConditions: eff.testConditions,
            doi: eff.doi,
            year: eff.year,
            notes: eff.notes,
          },
        })
        ec++
      }

      // --- 5. Verifications (idempotent via stable demo-ver-* ids) ---
      let vc = 0
      for (const ver of DEMO_VERIFICATIONS) {
        const materialId = materialIdByName.get(ver.materialName)
        if (!materialId) continue
        const slug = slugFor(ver.materialName)
        const verId = `demo-ver-${slug}`
        await tx.verification.upsert({
          where: { id: verId },
          create: {
            id: verId,
            materialId,
            status: ver.status,
            reviewer: ver.reviewer,
            notes: ver.notes,
            checkedFields: ver.checkedFields,
            project: 'default',
          },
          update: {
            materialId,
            status: ver.status,
            reviewer: ver.reviewer,
            notes: ver.notes,
            checkedFields: ver.checkedFields,
          },
        })
        vc++
      }

      return {
        papersCreated: pc,
        classificationsCreated: cc,
        efficienciesCreated: ec,
        verificationsCreated: vc,
      }
    })

    // --- 6. Invalidate caches so the dashboard reflects new data instantly ---
    clearAll()

    const summary = {
      materials: await db.material.count(),
      papers: papersCreated,
      classifications: classificationsCreated,
      efficiencies: efficienciesCreated,
      verifications: verificationsCreated,
    }

    return NextResponse.json(summary)
  } catch (e) {
    return apiError('Demo seed failed', 500, e)
  }
}
