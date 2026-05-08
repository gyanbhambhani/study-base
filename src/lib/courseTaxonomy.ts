// Department taxonomy + helpers for query expansion.
// Pulled out of the legacy /api/search route so /api/chat can reuse it.

export const prefixToDepartment: Record<string, string> = {
  Anthro: "Anthropology",
  AAS: "Asian American Studies Program",
  Astro: "Astronomy",
  BioE: "Bioengineering",
  Bio: "Biology",
  Buddh: "Buddhist Studies",
  ChemE: "Chemical Engineering",
  Chem: "Chemistry",
  Chinese: "Chinese",
  City: "City and Regional Planning",
  CEE: "Civil and Environmental Engineering",
  CE: "Civil and Environmental Engineering",
  Classics: "Classics",
  CogSci: "Cognitive Science",
  CWP: "College Writing Program",
  CompLit: "Comparative Literature",
  CS: "Computer Science",
  DS: "Data Science",
  Econ: "Economics",
  Educ: "Education",
  EE: "Electrical Engineering",
  ERG: "Energy and Resources Group",
  Eng: "Engineering",
  English: "English",
  EnvDes: "Environmental Design",
  ESPM: "Environmental Science, Policy, and Management",
  Ethnic: "Ethnic Studies",
  French: "French",
  Geog: "Geography",
  German: "German",
  Hist: "History",
  HistArt: "History of Art",
  IEOR: "Industrial Engineering and Operations Research",
  Info: "Information",
  IB: "Integrative Biology",
  Italian: "Italian Studies",
  Japn: "Japanese",
  Korean: "Korean",
  LA: "Landscape Architecture",
  Ling: "Linguistics",
  MSE: "Materials Science and Engineering",
  Math: "Mathematics",
  ME: "Mechanical Engineering",
  MCB: "Molecular and Cell Biology",
  Music: "Music",
  NES: "Near Eastern Studies",
  NE: "Nuclear Engineering",
  NST: "Nutritional Sciences and Toxicology",
  Phys: "Physics",
  PolSci: "Political Science",
  Psych: "Psychology",
  PH: "Public Health",
  PubPol: "Public Policy",
  Rhet: "Rhetoric",
  Scand: "Scandinavian",
  Soc: "Sociology",
  SAsian: "South Asian",
  Span: "Spanish",
  Stat: "Statistics",
  TDPS: "Theater, Dance, and Performance Studies",
  UGBA: "Undergraduate Business Administration",
};

const subjectVariations: Record<string, string> = {
  physics: "Phys",
  math: "Math",
  mathematics: "Math",
  "computer science": "CS",
  programming: "CS",
  chemistry: "Chem",
  biology: "Bio",
  economics: "Econ",
  statistics: "Stat",
  psychology: "Psych",
  history: "Hist",
  english: "English",
};

export interface ExtractedCourseInfo {
  courseCodes: string[];
  departments: string[];
  prefixes: string[];
  resourceTypes: string[];
  allTerms: string[];
}

// Pull every plausible signal out of a free-form prompt.
// Intentionally loose: we'd rather over-match here and let the model re-rank.
export function extractCourseInfo(prompt: string): ExtractedCourseInfo {
  let courseCodes: string[] = [];
  const departments: string[] = [];
  const prefixes: string[] = [];
  const resourceTypes: string[] = [];
  let allTerms: string[] = [];

  const courseMatches = prompt.match(/\b[A-Z]{2,6}\s*\d+[A-Z]?\b/gi);
  if (courseMatches) {
    courseMatches.forEach((match) => {
      const normalized = match.replace(/\s+/g, " ").trim();
      courseCodes.push(normalized);
      allTerms.push(normalized);
      const prefix = normalized.split(" ")[0];
      prefixes.push(prefix);
      if (prefixToDepartment[prefix]) {
        departments.push(prefixToDepartment[prefix]);
      }
    });
  }

  const numberMatches = prompt.match(/\b\d+[A-Z]?\b/g);
  if (numberMatches) {
    numberMatches.forEach((num) => {
      courseCodes.push(num);
      allTerms.push(num);
    });
  }

  const extraVariants: string[] = [];
  courseCodes.forEach((code) => {
    if (code.includes(" ")) {
      extraVariants.push(code.replace(/\s+/g, "_"));
      extraVariants.push(code.replace(/\s+/g, ""));
    }
  });
  courseCodes = Array.from(new Set([...courseCodes, ...extraVariants]));
  allTerms = Array.from(new Set([...allTerms, ...extraVariants]));

  Object.entries(prefixToDepartment).forEach(([prefix, department]) => {
    if (prompt.toLowerCase().includes(department.toLowerCase())) {
      departments.push(department);
      prefixes.push(prefix);
      allTerms.push(department);
    }
  });

  Object.keys(prefixToDepartment).forEach((prefix) => {
    const regex = new RegExp(`\\b${prefix}\\b`, "gi");
    if (regex.test(prompt)) {
      prefixes.push(prefix);
      departments.push(prefixToDepartment[prefix]);
      allTerms.push(prefix);
    }
  });

  Object.entries(subjectVariations).forEach(([variation, prefix]) => {
    if (prompt.toLowerCase().includes(variation)) {
      prefixes.push(prefix);
      if (prefixToDepartment[prefix]) {
        departments.push(prefixToDepartment[prefix]);
      }
      allTerms.push(variation);
    }
  });

  const resourceTypeTerms = [
    "midterm",
    "final",
    "exam",
    "homework",
    "hw",
    "quiz",
    "lecture",
    "notes",
    "lab",
    "discussion",
    "project",
  ];
  resourceTypeTerms.forEach((term) => {
    if (prompt.toLowerCase().includes(term)) {
      resourceTypes.push(term);
      allTerms.push(term);
    }
  });

  return {
    courseCodes: Array.from(new Set(courseCodes)),
    departments: Array.from(new Set(departments)),
    prefixes: Array.from(new Set(prefixes)),
    resourceTypes: Array.from(new Set(resourceTypes)),
    allTerms: Array.from(new Set(allTerms)),
  };
}
