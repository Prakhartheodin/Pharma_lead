// Religence Pharmaceuticals product portfolio — corticosteroid APIs & intermediates.
// Source: "List of product" portfolio PDF. Used to populate the Leads drug filter.
export interface DrugOption {
  name: string;
  /** Pharmacopoeial reference standard (IP/BP/USP, IH, etc.). */
  ref: string;
}

export const DRUG_OPTIONS: DrugOption[] = [
  { name: 'Budesonide', ref: 'IP/BP/USP' },
  { name: 'Deflazacort', ref: 'IH' },
  { name: 'Dutasteride', ref: 'IP/BP/USP' },
  { name: 'Methylprednisolone Acetate', ref: 'IP/USP' },
  { name: 'Methylprednisolone', ref: 'IP/BP' },
  { name: 'Methylprednisolone Hemisuccinate', ref: 'USP' },
  { name: 'Clobetasole Propionate', ref: 'IP/BP/USP' },
  { name: 'Dexamethasone Sodium Phosphate', ref: 'IP/BP/USP' },
  { name: 'Betamethasone Dipropionate', ref: 'IP/BP/USP' },
  { name: 'Betamethasone Sodium Phosphate', ref: 'IP/BP/USP' },
  { name: 'Betamethasone Valerate', ref: 'IP/BP/USP' },
  { name: 'Beclomethasone Dipropionate', ref: 'IP/BP/USP' },
  { name: 'Mometasone Furoate', ref: 'IP/BP/USP' },
  { name: 'Prednisolone Acetate', ref: 'IP/BP/USP' },
  { name: 'Hydrocortisone Acetate', ref: 'IP/BP/USP' },
  { name: 'Prednisolone Sodium Phosphate', ref: 'IP/BP/USP' },
  { name: 'Clobetasole Butyrate', ref: 'IP/BP/USP' },
  { name: 'Triamcinolone Acetonide', ref: 'IP/BP/USP' },
];

export const DRUG_NAMES: string[] = DRUG_OPTIONS.map((d) => d.name);
