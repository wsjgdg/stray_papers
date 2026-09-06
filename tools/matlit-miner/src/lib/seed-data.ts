import { db } from '@/lib/db'

// 60 representative perovskite / solar-cell related materials
// (subset curated for the demo; user can edit/add more)
export const SEED_MATERIALS: Array<{
  name: string
  aliases: string
  category: string
  notes: string
}> = [
  { name: 'MAPbI3', aliases: 'CH3NH3PbI3;methylammonium lead iodide;MAPbI3', category: 'perovskite', notes: 'Classic methylammonium lead triiodide perovskite' },
  { name: 'FAPbI3', aliases: 'HC(NH2)2PbI3;formamidinium lead iodide', category: 'perovskite', notes: 'Formamidinium lead triiodide, alpha phase photovoltaic' },
  { name: 'CsPbI3', aliases: 'cesium lead iodide;CsPbI3 perovskite', category: 'perovskite', notes: 'All-inorganic cesium lead iodide' },
  { name: 'MAPbBr3', aliases: 'CH3NH3PbBr3;methylammonium lead bromide', category: 'perovskite', notes: '' },
  { name: 'MAPbCl3', aliases: 'CH3NH3PbCl3;methylammonium lead chloride', category: 'perovskite', notes: '' },
  { name: 'FAPbBr3', aliases: 'formamidinium lead bromide', category: 'perovskite', notes: '' },
  { name: 'CsPbBr3', aliases: 'cesium lead bromide', category: 'perovskite', notes: '' },
  { name: 'MASnI3', aliases: 'CH3NH3SnI3;methylammonium tin iodide', category: 'perovskite', notes: 'Lead-free tin perovskite' },
  { name: 'FASnI3', aliases: 'formamidinium tin iodide', category: 'perovskite', notes: 'Lead-free' },
  { name: 'CsSnI3', aliases: 'cesium tin iodide', category: 'perovskite', notes: 'Lead-free inorganic' },
  { name: 'MAPbI2Br', aliases: 'CH3NH3PbI2Br', category: 'perovskite', notes: 'Mixed halide' },
  { name: 'MAPbIBr2', aliases: 'CH3NH3PbIBr2', category: 'perovskite', notes: 'Mixed halide' },
  { name: 'CsPbI2Br', aliases: 'cesium lead iodide bromide', category: 'perovskite', notes: 'Mixed halide inorganic' },
  { name: 'CsPbIBr2', aliases: 'cesium lead bromide iodide', category: 'perovskite', notes: '' },
  { name: 'FA0.83Cs0.17PbI3', aliases: 'FA/Cs mixed cation perovskite', category: 'perovskite', notes: 'Double-cation' },
  { name: 'MA0.17FA0.83PbI3', aliases: 'MA/FA mixed cation', category: 'perovskite', notes: '' },
  { name: 'Cs0.05FA0.85MA0.10PbI3', aliases: 'triple cation perovskite', category: 'perovskite', notes: 'Triple-cation' },
  { name: 'Cs2AgBiBr6', aliases: 'cesium silver bismuth bromide;double perovskite', category: 'perovskite', notes: 'Lead-free double perovskite' },
  { name: 'Cs2AgInCl6', aliases: 'cesium silver indium chloride', category: 'perovskite', notes: 'Lead-free double perovskite' },
  { name: 'Cs2Au2I6', aliases: 'cesium gold iodide double perovskite', category: 'perovskite', notes: '' },
  { name: 'Cs2NaBiCl6', aliases: 'cesium sodium bismuth chloride', category: 'perovskite', notes: '' },
  { name: 'Cs2AgSbCl6', aliases: 'cesium silver antimony chloride', category: 'perovskite', notes: '' },
  { name: 'Cs3Bi2I9', aliases: 'cesium bismuth iodide', category: 'perovskite', notes: 'Bismuth-based lead-free' },
  { name: 'MA3Bi2I9', aliases: 'methylammonium bismuth iodide', category: 'perovskite', notes: '' },
  { name: 'FA3Bi2I9', aliases: 'formamidinium bismuth iodide', category: 'perovskite', notes: '' },
  { name: 'AgBi2I7', aliases: 'silver bismuth iodide', category: 'perovskite', notes: '' },
  { name: 'Ag2BiI5', aliases: 'silver bismuth iodide', category: 'perovskite', notes: '' },
  { name: 'Sb2S3', aliases: 'antimony sulfide;stibnite', category: 'chalcogenide', notes: 'Antimony chalcogenide' },
  { name: 'Sb2Se3', aliases: 'antimony selenide', category: 'chalcogenide', notes: '' },
  { name: 'Sb2(S,Se)3', aliases: 'antimony selenosulfide', category: 'chalcogenide', notes: 'Alloy' },
  { name: 'Bi2S3', aliases: 'bismuth sulfide', category: 'chalcogenide', notes: '' },
  { name: 'Bi2Se3', aliases: 'bismuth selenide', category: 'chalcogenide', notes: '' },
  { name: 'Cu2ZnSnS4', aliases: 'CZTS;kesterite', category: 'chalcogenide', notes: 'Kesterite' },
  { name: 'Cu2ZnSnSe4', aliases: 'CZTSe', category: 'chalcogenide', notes: 'Kesterite selenide' },
  { name: 'Cu2ZnSn(S,Se)4', aliases: 'CZTSSe', category: 'chalcogenide', notes: '' },
  { name: 'CuInS2', aliases: 'CIS;chalcopyrite', category: 'chalcogenide', notes: '' },
  { name: 'CuInSe2', aliases: 'CISe', category: 'chalcogenide', notes: '' },
  { name: 'Cu(In,Ga)Se2', aliases: 'CIGS', category: 'chalcogenide', notes: '' },
  { name: 'Cu(In,Ga)(S,Se)2', aliases: 'CIGSSe', category: 'chalcogenide', notes: '' },
  { name: 'Cu2O', aliases: 'cuprous oxide', category: 'oxide', notes: '' },
  { name: 'CuO', aliases: 'cupric oxide', category: 'oxide', notes: '' },
  { name: 'Fe2O3', aliases: 'hematite;iron oxide', category: 'oxide', notes: '' },
  { name: 'BiVO4', aliases: 'bismuth vanadate', category: 'oxide', notes: '' },
  { name: 'TiO2', aliases: 'titanium dioxide;titania', category: 'oxide', notes: '' },
  { name: 'WO3', aliases: 'tungsten oxide', category: 'oxide', notes: '' },
  { name: 'ZnO', aliases: 'zinc oxide', category: 'oxide', notes: '' },
  { name: 'SnO2', aliases: 'tin oxide', category: 'oxide', notes: '' },
  { name: 'NiO', aliases: 'nickel oxide', category: 'oxide', notes: '' },
  { name: 'Nb2O5', aliases: 'niobium oxide', category: 'oxide', notes: '' },
  { name: 'BaTiO3', aliases: 'barium titanate', category: 'oxide', notes: '' },
  { name: 'SrTiO3', aliases: 'strontium titanate', category: 'oxide', notes: '' },
  { name: 'BiFeO3', aliases: 'bismuth ferrite', category: 'oxide', notes: '' },
  { name: 'MAPbI3-xClx', aliases: 'chloride-doped MAPbI3', category: 'perovskite', notes: '' },
  { name: 'PEAPbI3', aliases: 'phenethylammonium lead iodide;2D perovskite', category: 'perovskite', notes: '2D Ruddlesden-Popper' },
  { name: 'BA2PbI4', aliases: 'butylammonium lead iodide;2D perovskite', category: 'perovskite', notes: '2D' },
  { name: '(BA)2(MA)n-1PbnI3n+1', aliases: 'Ruddlesden-Popper perovskite', category: 'perovskite', notes: 'RP series' },
  { name: 'Cs3Sb2I9', aliases: 'cesium antimony iodide', category: 'perovskite', notes: 'Lead-free' },
  { name: 'K0.1FA0.9PbI3', aliases: 'potassium-doped FAPbI3', category: 'perovskite', notes: '' },
  { name: 'Cu2BaSnS4', aliases: 'CBTS', category: 'chalcogenide', notes: '' },
  { name: 'Cu2BaSnSe4', aliases: 'CBTSe', category: 'chalcogenide', notes: '' },
  { name: 'CdTe', aliases: 'cadmium telluride', category: 'chalcogenide', notes: '' },
  { name: 'CuSbS2', aliases: 'copper antimony sulfide;chalcostibite', category: 'chalcogenide', notes: '' },
  { name: 'CuSbSe2', aliases: 'copper antimony selenide', category: 'chalcogenide', notes: '' },
]

export async function seedMaterialsIfEmpty() {
  const count = await db.material.count()
  if (count > 0) return count
  for (const m of SEED_MATERIALS) {
    await db.material.create({ data: m })
  }
  return SEED_MATERIALS.length
}
